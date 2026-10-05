#!/usr/bin/env node
/**
 * 一条命令启动整个项目：
 *   npm start
 *
 * 自动完成：安装依赖 → Prisma 生成/迁移/种子 → 同时启动后端(3001)与前端(5173)。
 */
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

function runSync(args, cwd, label) {
  console.log(`\x1b[36m[setup]\x1b[0m ${label}`);
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit', shell: false });
  if (r.status !== 0) {
    console.error(`\x1b[31m[setup] 失败: ${label}\x1b[0m`);
    process.exit(r.status ?? 1);
  }
}

// 1. 安装依赖（根目录 npm workspaces 一次装齐）
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
  runSync(['install', '--no-audit', '--no-fund'], ROOT, '安装依赖');
}

// 1.5 准备后端环境变量（.env 被 gitignore，首次启动自动补默认配置）
const envPath = path.join(ROOT, 'server', '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(
    envPath,
    'DATABASE_URL="file:./dev.db"\nJWT_SECRET="dev-only-secret-change-me"\nPORT=3001\n',
  );
  console.log('\x1b[36m[setup]\x1b[0m 已生成 server/.env 默认配置');
}

// 2. 数据库：生成客户端 + 建表 + 种子（幂等，已有数据则跳过种子）
runSync(['--workspace', 'server', 'run', 'db:setup'], ROOT, '初始化数据库 (prisma generate + db push + seed)');

// 3. 同时启动前后端
const colors = { server: '\x1b[32m', client: '\x1b[35m' };
const children = [];

function start(name, args, cwd) {
  const child = spawn(npm, args, { cwd, shell: false });
  const prefix = `${colors[name]}[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) out.write(`${prefix}${line}\n`);
    });
    stream.on('end', () => buf && out.write(`${prefix}${buf}\n`));
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}进程退出 (code=${code})`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

function shutdown(code) {
  for (const c of children) {
    try { c.kill('SIGTERM'); } catch {}
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('server', ['--workspace', 'server', 'run', 'start:dev'], ROOT);
start('client', ['--workspace', 'client', 'run', 'dev'], ROOT);

console.log('\n\x1b[36m[setup]\x1b[0m 前端: http://localhost:5173  后端: http://localhost:3001/api');
console.log('\x1b[36m[setup]\x1b[0m 演示账号：住户 zhangsan / lisi，客服 agent01（免密登录）\n');
