// 测试环境：使用独立的 test.db，与开发库 dev.db 隔离
process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
