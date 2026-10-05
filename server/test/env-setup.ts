/** 每个测试 worker 启动时把 Prisma 指到测试库（须在任何模块加载前执行） */
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret';
