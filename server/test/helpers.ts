import { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function cleanDb(prisma: PrismaService) {
  await prisma.notification.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.adjustmentLine.deleteMany();
  await prisma.adjustment.deleteMany();
  await prisma.meterReceipt.deleteMany();
  await prisma.reviewTask.deleteMany();
  await prisma.disputeEvent.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.bill.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.meter.deleteMany();
  await prisma.resident.deleteMany();
  await prisma.user.deleteMany();
}

export interface Fixture {
  zhangUserId: string;
  liUserId: string;
  agentUserId: string;
  zhangResidentId: string;
  liResidentId: string;
  meterId: string;
  liMeterId: string;
  readings: Record<string, string>; // key: 2026-05 等 → readingId
  bills: Record<string, string>; // key: period → billId
  zhangPhotoToken: string;
}

/** 与种子同构的场景：6、7 月估抄偏低，8 月实抄账单突增 */
export async function seedFixture(prisma: PrismaService): Promise<Fixture> {
  const PRICE = 3.2;
  const zhang = await prisma.user.create({ data: { username: 'zhangsan', name: '张三', role: 'RESIDENT' } });
  const li = await prisma.user.create({ data: { username: 'lisi', name: '李四', role: 'RESIDENT' } });
  const agent = await prisma.user.create({ data: { username: 'agent01', name: '客服小王', role: 'AGENT' } });
  const zr = await prisma.resident.create({
    data: { accountNo: 'R1001', address: '幸福小区 3-2-501', userId: zhang.id },
  });
  const lr = await prisma.resident.create({
    data: { accountNo: 'R1002', address: '幸福小区 5-1-302', userId: li.id },
  });
  const meter = await prisma.meter.create({ data: { meterNo: 'G1001', residentId: zr.id } });
  const liMeter = await prisma.meter.create({ data: { meterNo: 'G1002', residentId: lr.id } });

  const defs = [
    { key: '2026-05', date: '2026-05-31', value: 1210, kind: 'ACTUAL' },
    { key: '2026-06', date: '2026-06-30', value: 1240, kind: 'ESTIMATED' },
    { key: '2026-07', date: '2026-07-31', value: 1270, kind: 'ESTIMATED' },
    { key: '2026-08', date: '2026-08-31', value: 1358, kind: 'ACTUAL' },
  ];
  const readings: Record<string, string> = {};
  let zhangPhotoToken = '';
  for (const d of defs) {
    const token = d.kind === 'ACTUAL' ? `photo-${d.key}` : null;
    if (token && !zhangPhotoToken) zhangPhotoToken = token;
    const r = await prisma.meterReading.create({
      data: {
        meterId: meter.id,
        date: new Date(`${d.date}T00:00:00.000Z`),
        value: d.value,
        kind: d.kind,
        photoToken: token,
      },
    });
    readings[d.key] = r.id;
  }
  const bills: Record<string, string> = {};
  const periods: [string, string, string][] = [
    ['2026-06', '2026-05', '2026-06'],
    ['2026-07', '2026-06', '2026-07'],
    ['2026-08', '2026-07', '2026-08'],
  ];
  const values: Record<string, number> = { '2026-05': 1210, '2026-06': 1240, '2026-07': 1270, '2026-08': 1358 };
  for (const [period, sk, ek] of periods) {
    const usage = values[ek] - values[sk];
    const b = await prisma.bill.create({
      data: {
        residentId: zr.id,
        meterId: meter.id,
        period,
        startValue: values[sk],
        endValue: values[ek],
        usage,
        unitPrice: PRICE,
        amount: Math.round(usage * PRICE * 100) / 100,
        status: 'UNPAID',
        startReadingId: readings[sk],
        endReadingId: readings[ek],
      },
    });
    bills[period] = b.id;
  }
  // 李四一条自己的账单（隔离测试用）
  const lr1 = await prisma.meterReading.create({
    data: { meterId: liMeter.id, date: new Date('2026-07-31T00:00:00.000Z'), value: 500, kind: 'ACTUAL', photoToken: 'photo-li-07' },
  });
  const lr2 = await prisma.meterReading.create({
    data: { meterId: liMeter.id, date: new Date('2026-08-31T00:00:00.000Z'), value: 528, kind: 'ACTUAL', photoToken: 'photo-li-08' },
  });
  await prisma.bill.create({
    data: {
      residentId: lr.id,
      meterId: liMeter.id,
      period: '2026-08',
      startValue: 500,
      endValue: 528,
      usage: 28,
      unitPrice: PRICE,
      amount: 89.6,
      status: 'UNPAID',
      startReadingId: lr1.id,
      endReadingId: lr2.id,
    },
  });

  return {
    zhangUserId: zhang.id,
    liUserId: li.id,
    agentUserId: agent.id,
    zhangResidentId: zr.id,
    liResidentId: lr.id,
    meterId: meter.id,
    liMeterId: liMeter.id,
    readings,
    bills,
    zhangPhotoToken,
  };
}

export async function login(app: INestApplication, username: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username });
  return res.body.token as string;
}

export function authed(app: INestApplication, token: string) {
  const server = app.getHttpServer();
  return {
    get: (url: string) => request(server).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(server).post(url).set('Authorization', `Bearer ${token}`),
  };
}
