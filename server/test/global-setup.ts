/** Jest globalSetup：准备独立的 SQLite 测试库（与开发库隔离） */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export default function globalSetup() {
  const serverDir = path.join(__dirname, '..');
  const dbPath = path.join(serverDir, 'prisma', 'test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  execSync('npx prisma db push --skip-generate --force-reset', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'inherit',
  });
}
