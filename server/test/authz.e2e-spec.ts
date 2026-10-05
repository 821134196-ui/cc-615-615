import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { authed, cleanDb, createTestApp, Fixture, login, seedFixture } from './helpers';

describe('数据隔离：住户只能读取自己的账单、照片与异议记录', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fx: Fixture;
  let zhang: string;
  let li: string;
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
    li = await login(app, 'lisi');
    agent = await login(app, 'agent01');
  });

  it('账单列表只返回自己的账单', async () => {
    const res = await authed(app, zhang).get('/api/bills').expect(200);
    expect(res.body.length).toBe(3);
    for (const b of res.body) expect(b.residentId).toBe(fx.zhangResidentId);

    const liBills = await authed(app, li).get('/api/bills').expect(200);
    expect(liBills.body.length).toBe(1);
    expect(liBills.body[0].residentId).toBe(fx.liResidentId);
  });

  it('住户不能读取他人账单详情与读数曲线', async () => {
    await authed(app, li).get(`/api/bills/${fx.bills['2026-08']}`).expect(404);
    await authed(app, li).get(`/api/bills/${fx.bills['2026-08']}/readings`).expect(404);
    // 自己的可以读
    await authed(app, zhang).get(`/api/bills/${fx.bills['2026-08']}`).expect(200);
    await authed(app, zhang).get(`/api/bills/${fx.bills['2026-08']}/readings`).expect(200);
  });

  it('住户不能读取他人抄表照片', async () => {
    await authed(app, li).get(`/api/files/photos/${fx.zhangPhotoToken}`).expect(404);
    const own = await authed(app, zhang).get(`/api/files/photos/${fx.zhangPhotoToken}`).expect(200);
    expect(own.headers['content-type']).toContain('image/svg+xml');
    // 客服可以读（工作需要）
    await authed(app, agent).get(`/api/files/photos/${fx.zhangPhotoToken}`).expect(200);
  });

  it('住户不能读取他人异议记录，也不能对他人账单提交异议', async () => {
    const created = await authed(app, zhang)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '费用异常' })
      .expect(201);
    const disputeId = created.body.id;

    // 李四看不到张三的异议
    await authed(app, li).get(`/api/disputes/${disputeId}`).expect(404);
    const liList = await authed(app, li).get('/api/disputes').expect(200);
    expect(liList.body.find((d: { id: string }) => d.id === disputeId)).toBeUndefined();

    // 李四不能对张三的账单提异议
    await authed(app, li)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '越权测试' })
      .expect(404);

    // 李四不能替张三确认/再异议
    await authed(app, li).post(`/api/disputes/${disputeId}/accept`).expect(404);
    await authed(app, li)
      .post(`/api/disputes/${disputeId}/reject`)
      .send({ note: '越权' })
      .expect(404);
  });

  it('住户不能读取他人补退流水', async () => {
    const res = await authed(app, zhang).get('/api/ledger').expect(200);
    for (const e of res.body) expect(e.residentId).toBe(fx.zhangResidentId);
  });

  it('住户角色不能访问客服接口', async () => {
    const created = await authed(app, zhang)
      .post('/api/disputes')
      .send({ billId: fx.bills['2026-08'], reason: '费用异常' })
      .expect(201);
    await authed(app, zhang)
      .post(`/api/disputes/${created.body.id}/schedule`)
      .send({ scheduledAt: '2026-09-03T10:00:00.000Z' })
      .expect(403);
    await authed(app, zhang)
      .post('/api/mock/meter-reading/onsite')
      .send({ meterId: fx.meterId })
      .expect(403);
  });

  it('未登录访问一律 401', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/bills').expect(401);
    await request(server).get('/api/disputes').expect(401);
    await request(server).get('/api/ledger').expect(401);
    await request(server).get(`/api/files/photos/${fx.zhangPhotoToken}`).expect(401);
  });
});
