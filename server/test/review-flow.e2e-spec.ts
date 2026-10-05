import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma.service';
import { authed, cleanDb, createTestApp, Fixture, login, seedFixture } from './helpers';

describe('异议复核全流程（跨期调整 + 重复回执幂等）', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixture;
  let zhang: string;
  let agent: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(prisma);
    fx = await seedFixture(prisma);
    zhang = await login(app, 'zhangsan');
    agent = await login(app, 'agent01');
  });

  async function createAndSchedule(): Promise<string> {
    const created = await authed(app, zhang)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '8 月账单突增，怀疑之前估抄不准' })
      .expect(201);
    const disputeId = created.body.id as string;
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/schedule`)
      .send({ scheduledAt: '2026-09-03T10:00:00.000Z' })
      .expect(201);
    return disputeId;
  }

  async function requestReceipt(): Promise<string> {
    const res = await authed(app, agent)
      .post('/api/mock/meter-reading/onsite')
      .send({ meterId: fx.meterId })
      .expect(201);
    return res.body.receiptNo as string;
  }

  const corrections = () => [
    { readingId: fx.readings['2026-06'], value: 1252 },
    { readingId: fx.readings['2026-07'], value: 1296 },
  ];

  it('完整流程：提交→预约→复核→跨期调整→住户确认关闭', async () => {
    const disputeId = await createAndSchedule();
    const receiptNo = await requestReceipt();

    const done = await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo, corrections: corrections(), reason: '6、7 月估抄偏低，按现场读数更正' })
      .expect(201);

    // 状态：结论已出，但未自动关闭
    expect(done.body.status).toBe('CONCLUSION_REACHED');

    // 调整单：三个账期的跨期明细
    const adjustment = await prisma.adjustment.findUnique({
      where: { receiptNo },
      include: { lines: { include: { ledgerEntry: true } } },
    });
    expect(adjustment).not.toBeNull();
    expect(adjustment!.lines).toHaveLength(3);
    expect(adjustment!.totalDelta).toBeCloseTo(0);

    const byPeriod = Object.fromEntries(adjustment!.lines.map((l) => [l.period, l]));
    expect(byPeriod['2026-06'].newUsage).toBe(42);
    expect(byPeriod['2026-06'].delta).toBeCloseTo(38.4);
    expect(byPeriod['2026-07'].newUsage).toBe(44);
    expect(byPeriod['2026-07'].delta).toBeCloseTo(44.8);
    expect(byPeriod['2026-08'].newUsage).toBe(62);
    expect(byPeriod['2026-08'].delta).toBeCloseTo(-83.2);

    // 补收、退款分别记入流水
    const ledger = await prisma.ledgerEntry.findMany({ orderBy: { period: 'asc' } });
    expect(ledger).toHaveLength(3);
    expect(ledger[0]).toMatchObject({ period: '2026-06', type: 'SURCHARGE' });
    expect(ledger[0].amount).toBeCloseTo(38.4);
    expect(ledger[1]).toMatchObject({ period: '2026-07', type: 'SURCHARGE' });
    expect(ledger[1].amount).toBeCloseTo(44.8);
    expect(ledger[2]).toMatchObject({ period: '2026-08', type: 'REFUND' });
    expect(ledger[2].amount).toBeCloseTo(83.2);

    // 原账单快照保持不变，原始估抄读数与照片保留
    const bill8 = await prisma.bill.findUnique({ where: { id: fx.bills['2026-08'] } });
    expect(bill8!.amount).toBeCloseTo(281.6);
    expect(bill8!.usage).toBe(88);
    const originalEst = await prisma.meterReading.findUnique({
      where: { id: fx.readings['2026-06'] },
      include: { supersededBy: true },
    });
    expect(originalEst!.kind).toBe('ESTIMATED');
    expect(originalEst!.value).toBe(1240);
    expect(originalEst!.supersededBy).not.toBeNull(); // 被复核更正读数取代，但原记录保留

    // 住户确认前不能关闭：接受后才是 CLOSED
    await authed(app, zhang).post(`/api/disputes/${disputeId}/accept`).expect(201);
    const after = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(after!.status).toBe('CLOSED');
  });

  it('重复抄表回执不能再次调整同一笔账（幂等）', async () => {
    const disputeId = await createAndSchedule();
    const receiptNo = await requestReceipt();

    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo, corrections: corrections(), reason: '按现场读数更正' })
      .expect(201);

    // 同一回执再次提交 → 409，且不产生新的调整/流水
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo, corrections: corrections(), reason: '重复提交' })
      .expect(409);
    expect(await prisma.adjustment.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(3);

    // 住户再异议退回 → 客服重新预约 → 同一回执仍然不能复用
    await authed(app, zhang)
      .post(`/api/disputes/${disputeId}/reject`)
      .send({ note: '对更正结果仍有疑问' })
      .expect(201);
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/schedule`)
      .send({ scheduledAt: '2026-09-05T10:00:00.000Z' })
      .expect(201);
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo, corrections: corrections(), reason: '试图复用旧回执' })
      .expect(409);
    expect(await prisma.adjustment.count()).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(3);

    // 新回执也不能重复更正同一条估抄读数（已被取代）
    const receipt2 = await requestReceipt();
    const res = await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo: receipt2, corrections: corrections(), reason: '重复更正同一读数' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/已被/);
    expect(await prisma.adjustment.count()).toBe(1);
  });

  it('复核未完成或结论未确认时，申请不会自动关闭', async () => {
    const disputeId = await createAndSchedule();
    // 复核未完成：不能 accept
    await authed(app, zhang).post(`/api/disputes/${disputeId}/accept`).expect(409);
    let d = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(d!.status).toBe('REVIEW_SCHEDULED');

    // 复核完成但住户未确认：仍是 CONCLUSION_REACHED，不是 CLOSED
    const receiptNo = await requestReceipt();
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/complete-review`)
      .send({ receiptNo, corrections: corrections(), reason: '更正' })
      .expect(201);
    d = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(d!.status).toBe('CONCLUSION_REACHED');

    // 住户仍有异议 → 退回重新受理
    await authed(app, zhang)
      .post(`/api/disputes/${disputeId}/reject`)
      .send({ note: '不认可结论' })
      .expect(201);
    d = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(d!.status).toBe('SUBMITTED');
  });

  it('同一账单已有未结案异议时不能重复提交', async () => {
    await authed(app, zhang)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '第一次' })
      .expect(201);
    await authed(app, zhang)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '第二次' })
      .expect(409);
  });

  it('复核结论为"读数无误"时不产生调整与流水', async () => {
    const disputeId = await createAndSchedule();
    await authed(app, agent)
      .post(`/api/disputes/${disputeId}/no-error`)
      .send({ note: '现场核对读数无误' })
      .expect(201);
    expect(await prisma.adjustment.count()).toBe(0);
    expect(await prisma.ledgerEntry.count()).toBe(0);
    const d = await prisma.dispute.findUnique({ where: { id: disputeId } });
    expect(d!.status).toBe('CONCLUSION_REACHED');
  });
});
