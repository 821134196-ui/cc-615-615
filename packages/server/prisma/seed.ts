/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { MockMeterService } from '../src/meter/mock-meter.service';
import {
  BillStatus,
  DisputeStatus,
  LedgerType,
  ReadingSource,
  ReadingType,
} from '../src/common/enums';

const prisma = new PrismaClient();
const mockMeter = new MockMeterService();

interface SeedMeter {
  username: string;
  displayName: string;
  meterNo: string;
  address: string;
  unitPrice: number; // 分
  readings: { period: string; value: number; type: string }[]; // 第一项为开账锚点读数
  disputes?: { period: string; reason: string; status: string }[];
}

const METERS: SeedMeter[] = [
  {
    username: 'zhang',
    displayName: '张建国',
    meterNo: 'M001',
    address: '幸福里小区 3 号楼 502',
    unitPrice: 260, // 2.60 元/m³
    readings: [
      { period: '2026-05', value: 100, type: ReadingType.ACTUAL },
      { period: '2026-06', value: 130, type: ReadingType.ACTUAL },
      { period: '2026-07', value: 160, type: ReadingType.ACTUAL },
      // 8 月估抄偏高：真实应为 190，现场复核修正后 8 月退款、9 月补收
      { period: '2026-08', value: 210, type: ReadingType.ESTIMATED },
      { period: '2026-09', value: 235, type: ReadingType.ACTUAL },
    ],
    disputes: [
      {
        period: '2026-08',
        reason: '8 月账单显示用了 50 立方米，明显高于平时，怀疑估抄偏高，要求上门复核。',
        status: DisputeStatus.SUBMITTED,
      },
    ],
  },
  {
    username: 'li',
    displayName: '李文静',
    meterNo: 'M002',
    address: '幸福里小区 7 号楼 1103',
    unitPrice: 280, // 2.80 元/m³
    readings: [
      { period: '2026-05', value: 50, type: ReadingType.ACTUAL },
      { period: '2026-06', value: 70, type: ReadingType.ACTUAL },
      { period: '2026-07', value: 95, type: ReadingType.ESTIMATED },
      { period: '2026-08', value: 125, type: ReadingType.ACTUAL },
      { period: '2026-09', value: 150, type: ReadingType.ACTUAL },
    ],
  },
];

async function main() {
  console.log('重置数据库并写入种子数据...');

  const passwordHash = await bcrypt.hash('resident123', 10);
  const agentHash = await bcrypt.hash('agent123', 10);

  const agent = await prisma.user.upsert({
    where: { username: 'agent' },
    update: {},
    create: { username: 'agent', passwordHash: agentHash, role: 'AGENT', displayName: '客服 王敏' },
  });

  for (const seed of METERS) {
    const resident = await prisma.user.upsert({
      where: { username: seed.username },
      update: {},
      create: {
        username: seed.username,
        passwordHash,
        role: 'RESIDENT',
        displayName: seed.displayName,
      },
    });

    const meter = await prisma.meter.create({
      data: { meterNo: seed.meterNo, address: seed.address, userId: resident.id },
    });

    const readingIds: Record<string, number> = {};
    for (let i = 0; i < seed.readings.length; i++) {
      const r = seed.readings[i];
      // 模拟抄表接口落盘原始照片（锚点读数为安装底数，无照片）
      let photoId: number | null = null;
      if (i > 0) {
        const file = mockMeter.uploadMeterPhoto({
          meterNo: seed.meterNo,
          value: r.value,
          periodKey: r.period,
          source: ReadingSource.ROUTINE,
        });
        const photo = await prisma.readingPhoto.create({
          data: {
            storagePath: file.storagePath,
            originalFilename: file.originalFilename,
            contentType: file.contentType,
            sha256: file.sha256,
          },
        });
        photoId = photo.id;
      }
      const row = await prisma.meterReading.create({
        data: {
          meterId: meter.id,
          periodKey: r.period,
          value: r.value,
          readingType: r.type,
          source: ReadingSource.ROUTINE,
          readAt: new Date(`${r.period}-15T09:00:00Z`),
          createdById: agent.id,
          photo: photoId ? { connect: { id: photoId } } : undefined,
        },
      });
      readingIds[r.period] = row.id;
    }

    // 按相邻读数出账（第一项读数是开账锚点，不出账单）
    for (let i = 1; i < seed.readings.length; i++) {
      const cur = seed.readings[i];
      const prev = seed.readings[i - 1];
      const usage = cur.value - prev.value;
      const bill = await prisma.bill.create({
        data: {
          meterId: meter.id,
          periodKey: cur.period,
          startReadingId: readingIds[prev.period],
          endReadingId: readingIds[cur.period],
          usage,
          unitPrice: seed.unitPrice,
          amount: usage * seed.unitPrice,
          status: BillStatus.ORIGINAL,
          createdAt: new Date(`${cur.period}-20T10:00:00Z`),
        },
      });
      // 原账单扣费流水
      await prisma.ledgerEntry.create({
        data: {
          residentId: resident.id,
          billId: bill.id,
          periodKey: cur.period,
          type: LedgerType.CHARGE,
          amount: bill.amount,
          idempotencyKey: `BILL:${bill.id}`,
          createdAt: new Date(`${cur.period}-20T10:00:00Z`),
        },
      });
    }

    for (const d of seed.disputes ?? []) {
      const bill = await prisma.bill.findFirstOrThrow({
        where: { meterId: meter.id, periodKey: d.period },
      });
      await prisma.dispute.create({
        data: { billId: bill.id, residentId: resident.id, reason: d.reason, status: d.status as any },
      });
    }
  }

  console.log('种子数据完成：');
  console.log('  客服   agent / agent123');
  console.log('  住户   zhang / resident123 （2026-08 账期有一条待处理异议，现场实抄应为 190）');
  console.log('  住户   li    / resident123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
