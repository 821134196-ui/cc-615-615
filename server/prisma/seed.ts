import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const UNIT_PRICE = 3.2; // 元/m³

function d(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

/** 由连续读数生成账单快照 */
async function createBillsForMeter(
  residentId: string,
  meterId: string,
  readings: { id: string; date: Date; value: number }[],
  paidBefore: string, // 该账期（不含）之前视为已缴
) {
  const sorted = [...readings].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1];
    const end = sorted[i];
    const period = end.date.toISOString().slice(0, 7);
    const usage = end.value - start.value;
    await prisma.bill.create({
      data: {
        residentId,
        meterId,
        period,
        startValue: start.value,
        endValue: end.value,
        usage,
        unitPrice: UNIT_PRICE,
        amount: Math.round(usage * UNIT_PRICE * 100) / 100,
        status: period < paidBefore ? 'PAID' : 'UNPAID',
        startReadingId: start.id,
        endReadingId: end.id,
        issuedAt: end.date,
      },
    });
  }
}

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log('数据库已有数据，跳过种子（如需重置请删除 server/prisma/dev.db 后重新启动）');
    return;
  }

  // ---------- 用户 ----------
  const zhangsan = await prisma.user.create({
    data: { username: 'zhangsan', name: '张三', role: 'RESIDENT' },
  });
  const lisi = await prisma.user.create({
    data: { username: 'lisi', name: '李四', role: 'RESIDENT' },
  });
  await prisma.user.create({
    data: { username: 'agent01', name: '客服小王', role: 'AGENT' },
  });

  const r1 = await prisma.resident.create({
    data: { accountNo: 'R1001', address: '幸福小区 3 栋 2 单元 501', userId: zhangsan.id },
  });
  const r2 = await prisma.resident.create({
    data: { accountNo: 'R1002', address: '幸福小区 5 栋 1 单元 302', userId: lisi.id },
  });

  const m1 = await prisma.meter.create({
    data: { meterNo: 'G1001', residentId: r1.id },
  });
  const m2 = await prisma.meter.create({
    data: { meterNo: 'G1002', residentId: r2.id },
  });

  // ---------- 张三的表 G1001：6、7 月估抄偏低，8 月实抄后账单突增 ----------
  const g1Readings: { date: string; value: number; kind: 'ACTUAL' | 'ESTIMATED' }[] = [
    { date: '2025-12-31', value: 1000, kind: 'ACTUAL' },
    { date: '2026-01-31', value: 1042, kind: 'ACTUAL' },
    { date: '2026-02-28', value: 1080, kind: 'ACTUAL' },
    { date: '2026-03-31', value: 1125, kind: 'ACTUAL' },
    { date: '2026-04-30', value: 1168, kind: 'ACTUAL' },
    { date: '2026-05-31', value: 1210, kind: 'ACTUAL' },
    { date: '2026-06-30', value: 1240, kind: 'ESTIMATED' }, // 估抄偏低（真实约 1252）
    { date: '2026-07-31', value: 1270, kind: 'ESTIMATED' }, // 估抄偏低（真实约 1296）
    { date: '2026-08-31', value: 1358, kind: 'ACTUAL' }, // 实抄补回 → 8 月账单暴涨
  ];
  const created1: { id: string; date: Date; value: number }[] = [];
  for (const r of g1Readings) {
    const rec = await prisma.meterReading.create({
      data: {
        meterId: m1.id,
        date: d(r.date),
        value: r.value,
        kind: r.kind,
        source: 'ROUTINE',
        photoToken: r.kind === 'ACTUAL' ? `photo-G1001-${r.date.replaceAll('-', '')}` : null,
      },
    });
    created1.push({ id: rec.id, date: rec.date, value: rec.value });
  }
  await createBillsForMeter(r1.id, m1.id, created1, '2026-08');

  // ---------- 李四的表 G1002：全部实抄、用量平稳 ----------
  const g2Readings: { date: string; value: number; kind: 'ACTUAL' | 'ESTIMATED' }[] = [
    { date: '2026-05-31', value: 500, kind: 'ACTUAL' },
    { date: '2026-06-30', value: 528, kind: 'ACTUAL' },
    { date: '2026-07-31', value: 551, kind: 'ACTUAL' },
    { date: '2026-08-31', value: 579, kind: 'ACTUAL' },
  ];
  const created2: { id: string; date: Date; value: number }[] = [];
  for (const r of g2Readings) {
    const rec = await prisma.meterReading.create({
      data: {
        meterId: m2.id,
        date: d(r.date),
        value: r.value,
        kind: r.kind,
        source: 'ROUTINE',
        photoToken: `photo-G1002-${r.date.replaceAll('-', '')}`,
      },
    });
    created2.push({ id: rec.id, date: rec.date, value: rec.value });
  }
  await createBillsForMeter(r2.id, m2.id, created2, '2026-08');

  console.log('种子数据完成：');
  console.log('  住户账号 zhangsan / lisi，客服账号 agent01（演示环境免密登录）');
  console.log('  张三 G1001：2026-06、2026-07 为估抄，2026-08 实抄后账单突增（异议演示场景）');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
