import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { MockMeterService } from '../src/meter/mock-meter.service';
import {
  BillStatus,
  LedgerType,
  ReadingSource,
  ReadingType,
} from '../src/common/enums';

const prisma = new PrismaClient();
const mockMeter = new MockMeterService();

async function resetDb() {
  // 按依赖顺序清空（SQLite 外键）
  await prisma.ledgerEntry.deleteMany();
  await prisma.adjustmentLine.deleteMany();
  await prisma.adjustment.deleteMany();
  await prisma.fieldReview.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.readingPhoto.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.user.deleteMany();
}

async function seedResident(opts: {
  username: string;
  displayName: string;
  meterNo: string;
  unitPrice: number;
  readings: { period: string; value: number; type: string }[];
}) {
  const hash = await bcrypt.hash('resident123', 10);
  const user = await prisma.user.create({
    data: { username: opts.username, passwordHash: hash, role: 'RESIDENT', displayName: opts.displayName },
  });
  const meter = await prisma.meter.create({
    data: { meterNo: opts.meterNo, address: `${opts.meterNo} 地址`, userId: user.id },
  });
  const readingIds: Record<string, number> = {};
  const photoIds: Record<string, number> = {};
  for (let i = 0; i < opts.readings.length; i++) {
    const r = opts.readings[i];
    let photoId: number | undefined;
    if (i > 0) {
      const file = mockMeter.uploadMeterPhoto({
        meterNo: opts.meterNo,
        value: r.value,
        periodKey: r.period,
        source: ReadingSource.ROUTINE,
      });
      const photo = await prisma.readingPhoto.create({ data: file });
      photoId = photo.id;
      photoIds[r.period] = photoId;
    }
    const row = await prisma.meterReading.create({
      data: {
        meterId: meter.id,
        periodKey: r.period,
        value: r.value,
        readingType: r.type,
        source: ReadingSource.ROUTINE,
        readAt: new Date(`${r.period}-15T00:00:00Z`),
        photo: photoId ? { connect: { id: photoId } } : undefined,
      },
    });
    readingIds[r.period] = row.id;
  }
  const bills: Record<string, any> = {};
  for (let i = 1; i < opts.readings.length; i++) {
    const cur = opts.readings[i];
    const prev = opts.readings[i - 1];
    const usage = cur.value - prev.value;
    const bill = await prisma.bill.create({
      data: {
        meterId: meter.id,
        periodKey: cur.period,
        startReadingId: readingIds[prev.period],
        endReadingId: readingIds[cur.period],
        usage,
        unitPrice: opts.unitPrice,
        amount: usage * opts.unitPrice,
        status: BillStatus.ORIGINAL,
      },
    });
    await prisma.ledgerEntry.create({
      data: {
        residentId: user.id,
        billId: bill.id,
        periodKey: cur.period,
        type: LedgerType.CHARGE,
        amount: bill.amount,
        idempotencyKey: `BILL:${bill.id}`,
      },
    });
    bills[cur.period] = bill;
  }
  return { user, meter, bills, photoIds };
}

describe('账单异议与复核（端到端）', () => {
  let app: INestApplication;
  let agentToken: string;
  let tokenA: string;
  let tokenB: string;
  let A: { user: any; meter: any; bills: Record<string, any>; photoIds: Record<string, number> };
  let B: { user: any; meter: any; bills: Record<string, any>; photoIds: Record<string, number> };

  const login = (username: string, password = 'resident123') =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .then((r) => r.body.accessToken as string);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    await resetDb();
    const agentHash = await bcrypt.hash('agent123', 10);
    await prisma.user.create({
      data: { username: 'agent', passwordHash: agentHash, role: 'AGENT', displayName: '客服' },
    });

    A = await seedResident({
      username: 'zhang_e2e',
      displayName: '张建国',
      meterNo: 'E001',
      unitPrice: 260,
      readings: [
        { period: '2026-05', value: 100, type: ReadingType.ACTUAL },
        { period: '2026-06', value: 130, type: ReadingType.ACTUAL },
        { period: '2026-07', value: 160, type: ReadingType.ACTUAL },
        { period: '2026-08', value: 210, type: ReadingType.ESTIMATED },
        { period: '2026-09', value: 235, type: ReadingType.ACTUAL },
      ],
    });
    B = await seedResident({
      username: 'li_e2e',
      displayName: '李文静',
      meterNo: 'E002',
      unitPrice: 280,
      readings: [
        { period: '2026-05', value: 50, type: ReadingType.ACTUAL },
        { period: '2026-06', value: 70, type: ReadingType.ACTUAL },
        { period: '2026-07', value: 95, type: ReadingType.ACTUAL },
        { period: '2026-08', value: 125, type: ReadingType.ACTUAL },
        { period: '2026-09', value: 150, type: ReadingType.ACTUAL },
      ],
    });

    agentToken = await login('agent', 'agent123');
    tokenA = await login('zhang_e2e');
    tokenB = await login('li_e2e');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const tomorrow = () => new Date(Date.now() + 86400000).toISOString();

  // ------------------------------------------------------------------
  // 1. 跨期差额：8 月退款 + 9 月补收，分别入流水
  // ------------------------------------------------------------------
  describe('跨期差额计算与调整单', () => {
    let disputeId: number;
    const RECEIPT = 'RC-E2E-0001';

    it('住户对 2026-08 账期提交异议', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/disputes')
        .set(auth(tokenA))
        .send({ billId: A.bills['2026-08'].id, reason: '8 月用量异常偏高' })
        .expect(201);
      disputeId = res.body.id;
      expect(res.body.status).toBe('SUBMITTED');
      expect(res.body.bill.amount).toBe(50 * 260);
    });

    it('客服安排并完成现场复核：实抄 190（原估抄 210）', async () => {
      await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/schedule`)
        .set(auth(agentToken))
        .send({ scheduledAt: tomorrow() })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/complete-review`)
        .set(auth(agentToken))
        .send({ result: 'ERROR_FOUND', correctedValue: 190, reason: '估抄偏高，现场实抄为 190', receiptNo: RECEIPT })
        .expect(201);

      expect(res.body.status).toBe('REVIEWED');
      const lines = res.body.adjustment.lines;
      expect(lines).toHaveLength(2);

      const aug = lines.find((l: any) => l.periodKey === '2026-08');
      const sep = lines.find((l: any) => l.periodKey === '2026-09');
      // 8 月：用量 50 → 30，退款 20m³ × 2.60 = 52.00 元
      expect(aug.kind).toBe('REFUND');
      expect(aug.deltaUsage).toBe(-20);
      expect(aug.deltaAmount).toBe(-5200);
      // 9 月：用量 25 → 45，补收 20m³ × 2.60 = 52.00 元
      expect(sep.kind).toBe('SURCHARGE');
      expect(sep.deltaUsage).toBe(20);
      expect(sep.deltaAmount).toBe(5200);
      // 总量守恒
      expect(aug.deltaAmount + sep.deltaAmount).toBe(0);
      // 两行都已分别记入流水
      expect(aug.ledgerEntry.type).toBe('REFUND');
      expect(sep.ledgerEntry.type).toBe('SURCHARGE');
    });

    it('原账单快照保持不变，调整以补退明细并列展示', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bills/${A.bills['2026-08'].id}`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body.amount).toBe(13000); // 原金额仍为 130.00 元
      expect(res.body.status).toBe('ADJUSTED');
      expect(res.body.adjustmentLines).toHaveLength(1);
      expect(res.body.adjustmentLines[0].deltaAmount).toBe(-5200);
    });

    it('补收、退款分别记入流水', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/ledger')
        .set(auth(tokenA))
        .expect(200);
      const refund = res.body.find((e: any) => e.type === 'REFUND');
      const surcharge = res.body.find((e: any) => e.type === 'SURCHARGE');
      expect(refund).toMatchObject({ periodKey: '2026-08', amount: -5200 });
      expect(surcharge).toMatchObject({ periodKey: '2026-09', amount: 5200 });
      // 幂等键含回执与账单
      expect(refund.idempotencyKey).toBe(`ADJ:${RECEIPT}:${A.bills['2026-08'].id}`);
    });

    it('原始估抄读数与照片保留，现场实抄记录（ACTUAL/ONSITE）并存', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/bills/meter/${A.meter.id}/readings`)
        .set(auth(tokenA))
        .expect(200);
      const augReadings = res.body.filter((r: any) => r.periodKey === '2026-08');
      const estimated = augReadings.find((r: any) => r.readingType === 'ESTIMATED');
      const onsite = augReadings.find((r: any) => r.source === 'ONSITE');
      expect(estimated.value).toBe(210); // 原记录未删改
      expect(estimated.photo).not.toBeNull(); // 原照片仍在
      expect(onsite).toMatchObject({ value: 190, readingType: 'ACTUAL', receiptNo: RECEIPT });
    });

    it('调整原因与回执随调整单返回', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/disputes/${disputeId}`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.body.adjustment.reason).toContain('估抄偏高');
      expect(res.body.adjustment.receiptNo).toBe(RECEIPT);
    });
  });

  // ------------------------------------------------------------------
  // 2. 重复抄表回执 / 同一笔账重复调整
  // ------------------------------------------------------------------
  describe('重复回执处理', () => {
    let dispute2: number;
    const RECEIPT = 'RC-E2E-0001'; // 与第一次调整相同

    it('另一账期（2026-07）的异议，复用已用回执 → 409', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/disputes')
        .set(auth(tokenA))
        .send({ billId: A.bills['2026-07'].id, reason: '7 月也要复核' })
        .expect(201);
      dispute2 = created.body.id;

      await request(app.getHttpServer())
        .post(`/api/disputes/${dispute2}/schedule`)
        .set(auth(agentToken))
        .send({ scheduledAt: tomorrow() })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/disputes/${dispute2}/complete-review`)
        .set(auth(agentToken))
        .send({ result: 'ERROR_FOUND', correctedValue: 145, reason: '复核', receiptNo: RECEIPT })
        .expect(409);
      expect(res.body.message).toMatch(/重复回执|已使用/);
    });

    it('换新回执，但调整触及已调整账期（次期 8 月已调整）→ 409，同一笔账不二次调整', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/disputes/${dispute2}/complete-review`)
        .set(auth(agentToken))
        .send({ result: 'ERROR_FOUND', correctedValue: 145, reason: '复核', receiptNo: 'RC-E2E-0002' })
        .expect(409);
      expect(res.body.message).toMatch(/不能重复调整/);
    });

    it('被拒后未产生第二张调整单，流水也未增加', async () => {
      const adjustments = await prisma.adjustment.count({ where: { disputeId: dispute2 } });
      expect(adjustments).toBe(0);
      const ledger = await prisma.ledgerEntry.count({
        where: { residentId: A.user.id, type: { in: ['REFUND', 'SURCHARGE'] } },
      });
      expect(ledger).toBe(2); // 仍是第一次调整的退款 + 补收两条
    });
  });

  // ------------------------------------------------------------------
  // 3. 关闭守卫：复核未完成 / 仍有异议 不得自动关闭
  // ------------------------------------------------------------------
  describe('异议状态与关闭守卫', () => {
    let disputeId: number;

    beforeAll(async () => {
      const d = await prisma.dispute.findFirstOrThrow({
        where: { billId: A.bills['2026-08'].id },
        orderBy: { id: 'asc' },
      });
      disputeId = d.id;
    });

    it('复核完成但住户未确认时，客服关闭 → 409', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/disputes/${disputeId}/close`)
        .set(auth(agentToken))
        .expect(409);
      expect(res.body.message).toMatch(/确认/);
    });

    it('住户不认可结论（不填原因 → 400；填写后 → DISPUTED_AGAIN）', async () => {
      await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/respond`)
        .set(auth(tokenA))
        .send({ agree: false })
        .expect(400);

      const res = await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/respond`)
        .set(auth(tokenA))
        .send({ agree: false, note: '不认可，要求二次上门' })
        .expect(201);
      expect(res.body.status).toBe('DISPUTED_AGAIN');
    });

    it('住户仍有异议时关闭 → 409（不得自动关闭）', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/disputes/${disputeId}/close`)
        .set(auth(agentToken))
        .expect(409);
      expect(res.body.message).toMatch(/仍有异议/);
    });

    it('重新安排复核，结论为读数无误；住户认可后才能关闭', async () => {
      await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/schedule`)
        .set(auth(agentToken))
        .send({ scheduledAt: tomorrow() })
        .expect(201);
      const reviewed = await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/complete-review`)
        .set(auth(agentToken))
        .send({ result: 'NO_ERROR', note: '二次复核读数一致' })
        .expect(201);
      expect(reviewed.body.status).toBe('REVIEWED');
      // 第二次复核读数无误不产生新调整单；第一次的调整单与流水仍然保留
      expect(reviewed.body.adjustment.receiptNo).toBe('RC-E2E-0001');
      expect(reviewed.body.reviews).toHaveLength(2);

      await request(app.getHttpServer())
        .patch(`/api/disputes/${disputeId}/close`)
        .set(auth(agentToken))
        .expect(409); // 住户还没确认

      await request(app.getHttpServer())
        .post(`/api/disputes/${disputeId}/respond`)
        .set(auth(tokenA))
        .send({ agree: true })
        .expect(201);

      const closed = await request(app.getHttpServer())
        .patch(`/api/disputes/${disputeId}/close`)
        .set(auth(agentToken))
        .expect(200);
      expect(closed.body.status).toBe('CLOSED');
      expect(closed.body.closedAt).not.toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // 4. 住户只能读取自己的账单、照片、异议与流水
  // ------------------------------------------------------------------
  describe('数据归属与权限', () => {
    it('无凭证 → 401', async () => {
      await request(app.getHttpServer()).get('/api/bills').expect(401);
    });

    it('住户 B 读取住户 A 的账单/异议/读数曲线/照片 → 一律 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/bills/${A.bills['2026-08'].id}`)
        .set(auth(tokenB))
        .expect(404);

      const disputeA = await prisma.dispute.findFirstOrThrow({ where: { residentId: A.user.id } });
      await request(app.getHttpServer())
        .get(`/api/disputes/${disputeA.id}`)
        .set(auth(tokenB))
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/bills/meter/${A.meter.id}/readings`)
        .set(auth(tokenB))
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/photos/${A.photoIds['2026-08']}/content`)
        .set(auth(tokenB))
        .expect(404);
    });

    it('住户 B 的列表接口只返回自己的数据', async () => {
      const bills = await request(app.getHttpServer()).get('/api/bills').set(auth(tokenB)).expect(200);
      expect(bills.body.every((b: any) => b.meter.id === B.meter.id)).toBe(true);

      const disputes = await request(app.getHttpServer()).get('/api/disputes').set(auth(tokenB)).expect(200);
      expect(disputes.body).toEqual([]);

      const ledger = await request(app.getHttpServer()).get('/api/ledger').set(auth(tokenB)).expect(200);
      expect(ledger.body.every((e: any) => e.bill?.meterNo === 'E002')).toBe(true);
    });

    it('住户 A 可以取到自己账单的原始照片内容', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/photos/${A.photoIds['2026-08']}/content`)
        .set(auth(tokenA))
        .expect(200);
      expect(res.headers['content-type']).toContain('image/svg');
      const bodyText = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text;
      expect(bodyText).toContain('00000210');
    });

    it('住户不能调用客服操作 → 403', async () => {
      const fresh = await request(app.getHttpServer())
        .post('/api/disputes')
        .set(auth(tokenB))
        .send({ billId: B.bills['2026-08'].id, reason: 'test' })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/disputes/${fresh.body.id}/schedule`)
        .set(auth(tokenB))
        .send({ scheduledAt: tomorrow() })
        .expect(403);
    });

    it('同一账期存在进行中异议时禁止重复提交 → 409', async () => {
      const open = await prisma.dispute.findFirstOrThrow({
        where: { residentId: B.user.id, status: 'SUBMITTED' },
      });
      const res = await request(app.getHttpServer())
        .post('/api/disputes')
        .set(auth(tokenB))
        .send({ billId: open.billId, reason: '再提一次' })
        .expect(409);
      expect(res.body.message).toMatch(/进行中/);
    });

    it('客服可以查看住户 A 的数据', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bills')
        .query({ residentId: A.user.id })
        .set(auth(agentToken))
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((b: any) => b.meter.id === A.meter.id)).toBe(true);
    });
  });
});
