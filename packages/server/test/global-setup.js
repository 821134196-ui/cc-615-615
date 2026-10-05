const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  // 以测试库建立结构（测试自身会在 beforeAll 清空所有表，无需 reset）
  execSync('npx prisma db push --skip-generate', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
};
