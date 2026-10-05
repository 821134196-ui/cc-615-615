# 居民燃气费账单异议与用量复核系统

居民对某个账期的燃气费有疑问时，客服可调取抄表记录、安排现场复核，
向居民并列展示**原账单金额、调整原因、补收/退款明细**，并完成跨期差额结算。

技术栈：TypeScript · NestJS · React · Prisma · SQLite，npm workspaces 单仓管理，
抄表（含照片）与通知由**本地模拟接口**提供，一条命令启动前后端。

## 快速开始

```bash
npm install        # 安装依赖并生成 Prisma Client
npm run setup      # 初始化 SQLite + 写入演示数据（需先执行一次）
npm run dev        # 一条命令同时启动 API(:3001) 与 Web(:5173)
```

打开 http://localhost:5173 ，演示账号：

| 角色 | 用户名 | 密码 |
|---|---|---|
| 客服 | `agent` | `agent123` |
| 住户 张建国 | `zhang` | `resident123` |
| 住户 李文静 | `li` | `resident123` |

`zhang` 的 **2026-08** 账期有一条待处理异议：原估抄期末读数 210 m³（偏高），
现场复核实抄应为 **190 m³**，完成复核后可看到 8 月退款 52.00 元、9 月跨期补收 52.00 元。

其他命令：

```bash
npm test           # 单元 + 端到端测试（26 项，使用独立 test.db）
npm run build      # 构建前后端
```

## 业务规则与实现对照

| 需求 | 实现 |
|---|---|
| 居民按账期提交异议 | `POST /api/disputes`，同一账期存在未关闭异议时 409 去重 |
| 客服调取抄表记录并安排现场复核 | 读数曲线接口 + `POST /disputes/:id/schedule` |
| 读数曲线标明估抄/实抄 | `readingType=ESTIMATED/ACTUAL`，曲线橙=估抄、蓝=实抄，现场点带白环 |
| 确认有误后生成调整单 | 一张调整单含按账期拆分的补退明细行 |
| 原账单和原始抄表照片继续保留 | `Bill` 金额为不可变快照；新增 ONSITE 实抄记录，不改写不删除原记录/照片 |
| 原金额、调整原因、补退明细同页展示 | 异议详情页四个金额卡 + 调整单表格 |
| 复核未完成/居民仍有异议不得自动关闭 | 关闭接口仅允许 `RESOLVED` 状态，其余 409；前端无自动关闭入口 |
| 跨期补收、退款分别记入流水 | `LedgerEntry` 分 `SURCHARGE`/`REFUND` 两类，幂等键 `ADJ:<回执>:<账单>` |
| 重复抄表回执不能再次调整 | 应用层前置校验 + 数据库唯一约束双保险，冲突返回 409 |
| 住户只能读取自己的数据 | 账单/异议/读数/照片/流水全部做归属过滤，越权返回 404（不泄露存在性） |

### 跨期差额计算

表具读数为**累计值**。设现场实抄修正的账期期末读数差为 δ = 修正值 − 原值：

- 当期用量变化 **+δ**：δ<0 退款、δ>0 补收；
- 下一已出账账期用量变化 **−δ**（其期初读数被修正，期末锚点不变），方向相反；
- 总用量守恒（两行之和为 0），但两期可按各自单价分别计价。

纯函数实现见 `packages/server/src/billing/billing-calc.service.ts`，
并含单调性校验（修正值不得低于当期期初读数、不得高于次期期末读数）。

### 状态流转

```
SUBMITTED ──安排复核──▶ SCHEDULED ──完成复核──▶ REVIEWED ──住户认可──▶ RESOLVED ──客服关闭──▶ CLOSED
                              ▲                    │
                              └──── 住户仍有异议 ◀──┘
                                   (DISPUTED_AGAIN：可再次安排复核，不可关闭)
```

## 目录结构

```
packages/
  server/                 NestJS + Prisma
    prisma/schema.prisma  数据模型（账单快照/读数/异议/复核/调整单/流水/照片/通知）
    prisma/seed.ts        演示数据
    src/billing/          账单、读数曲线、照片、跨期计算
    src/disputes/         异议工作流（安排/复核/调整/表态/关闭）
    src/meter/            本地模拟抄表接口（回执 + SVG 照片落盘 storage/photos）
    src/notification/     本地模拟通知接口（站内信）
    test/                 跨期差额单测 + 全流程 e2e（26 项）
  web/                    React + Vite
    src/components/ReadingCurve.tsx  读数曲线（内联 SVG，悬停十字线）
    src/components/DisputePanel.tsx  原金额/调整原因/补退明细/复核记录同页
```

## 主要接口（均需 Bearer JWT）

- `POST /api/auth/login`、`GET /api/auth/me`
- `GET /api/bills`、`GET /api/bills/:id`、`GET /api/bills/meter/:meterId/readings`
- `GET /api/photos/:id/content`（归属校验后返回原始照片）
- `GET/POST /api/disputes`、`GET /api/disputes/:id`
- `POST /api/disputes/:id/schedule`（客服）
- `POST /api/disputes/:id/complete-review`（客服；读数无误 / 有误并生成调整单）
- `POST /api/disputes/:id/respond`（住户认可 / 仍有异议）
- `PATCH /api/disputes/:id/close`（客服，仅 RESOLVED 可关）
- `GET /api/ledger`、`GET /api/notifications`
