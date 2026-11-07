# 熬鹰资本监控系统 · 设计说明

日期：2026-11-05
状态：已批准（用户 m00188/m00193 确认：React Web + Flutter Android，逐步增量交付）

## 1. 目标与非目标

> **2026-11-07 定位变更**：本节已按「信号驱动的自动跟单」重写。
> 原「只读监控、不执行任何交易」的前提作废，详见
> [跟单方案](2026-11-07-copy-trading-strategy.md) 与 [待办池](../../backlog.md)。

**目标**
1. 在境外服务器（Vultr 大阪）长期在线地采集熬鹰资本的公开与半公开信息，解决 Telegram 吞消息与需要 VPN 的问题。
2. 把 Telegram（四分区）、X、OKX 实盘、fomo 链上钱包、Binance（经 TG 消息推断）汇成一条统一时间线。
3. **把 Telegram 的仓位信号实时转成真实委托，实现外场信息驱动的自动跟单。**
4. 用 AI 分析熬鹰在群聊中发表的观点，作为跟单决策的**否决器**。
5. 每条信号与每笔委托都带来源与置信度，可回溯到原始消息与我方原始成交。
6. 仓位发生变化时，在数秒内推送到 Android 手机与 Web 页面；严重事件有兜底通道。

**非目标**
- **不做提现与转账**：交易所 API key 永久禁用提现权限。
- 不做跨场所净额（Binance/OKX/链上分开统计）、不做跨交易所对冲。
- 不做高频抢跑 —— 链路延迟 3~20 秒，抢跑既做不到也不该做。
- 不做 Windows 桌面端、不做 iOS（当前阶段）。
- 不替用户绕过平台风控，不批量注册账号。

## 2. 架构

```
┌──────────────┐   Telethon(MTProto)   ┌────────────────────┐
│ Telegram 4群 │ ────────────────────▶ │                    │
└──────────────┘                       │   FastAPI (api)    │
┌──────────────┐   twscrape / RSS      │  + APScheduler     │
│ X @thankUcry │ ────────────────────▶ │  + collector 进程  │
└──────────────┘                       │                    │
┌──────────────┐   OKX 只读签名 API    │                    │
│ OKX 实盘     │ ────────────────────▶ │                    │
└──────────────┘                       │                    │
┌──────────────┐   Solana/Base RPC     │                    │
│ fomo 钱包    │ ────────────────────▶ │                    │
└──────────────┘                       └─────────┬──────────┘
                                                 │ Postgres 16
                                     ┌───────────┴────────────┐
                                     │ LISTEN/NOTIFY 事件总线 │
                                     └───────┬───────────┬────┘
                                             │ WS        │ HTTP
                                     ┌───────▼────┐  ┌───▼─────────┐
                                     │ Flutter APK│  │ React Web   │
                                     │ 前台服务    │  │ (Caddy 托管)│
                                     └────────────┘  └─────────────┘
```

- 单一 FastAPI 进程承载 HTTP API 与 WebSocket；采集器以独立进程（`worker`）运行，避免长任务阻塞 API。
- 事件通过 Postgres `NOTIFY` 传播，WebSocket 网关 `LISTEN` 后扇出；不用 Redis。
- Caddy 同域托管 React 构建产物并反代 `/api`、`/ws`、`/healthz`，避免跨域与额外证书配置。

## 3. 数据模型（核心表）

| 表 | 作用 | 关键列 |
| --- | --- | --- |
| `sources` | 数据源注册与健康 | `key`(telegram/x/okx/chain/binance), `enabled`, `last_ok_at`, `last_error` |
| `raw_messages` | Telegram 原始消息（含编辑/删除版本） | `chat_id`, `msg_id`, `version`, `text`, `media_json`, `deleted_at`, `posted_at` |
| `raw_posts` | X 帖子 | `post_id`, `text`, `posted_at`, `raw_json` |
| `raw_okx_positions` | OKX 持仓快照 | `author_id`, `inst_id`, `pos_side`, `pos`, `avg_px`, `upl`, `snapshot_at` |
| `raw_okx_trades` | OKX 成交记录 | `trade_id`, `inst_id`, `side`, `sz`, `px`, `ts` |
| `chain_wallets` | 已解析的钱包 | `chain`, `address`, `label`, `source` |
| `chain_txs` | 链上交易 | `chain`, `signature`, `slot/block`, `ts`, `raw_json` |
| `chain_transfers` | 交易内代币变动 | `tx_id`, `mint`, `symbol`, `delta`, `decimals`, `usd_hint` |
| `signals` | 抽取后的结构化信号（含 LLM 结果） | `kind`, `payload_json`, `confidence`, `model`, `evidence_ref` |
| `positions` | 归一化持仓 | `venue`, `symbol`, `side`, `size`, `entry_px`, `mark_px`, `confidence`, `updated_at` |
| `position_events` | 仓位变化事件 | `position_id`, `change_type`, `delta_size`, `delta_pct`, `notional_usd`, `detected_at` |
| `alerts` | 推送记录 | `event_id`, `channel`, `status`, `attempts`, `delivered_at`, `acked_at` |
| `devices` | 已登录设备 | `user_id`, `platform`, `push_token`, `app_version`, `last_seen_at` |
| `device_sessions` | 刷新令牌会话 | `device_id`, `refresh_hash`, `expires_at`, `revoked_at` |
| `ws_tickets` | 一次性 WS 票据 | `ticket_hash`, `device_id`, `expires_at`, `used_at` |
| `app_releases` | APK 版本登记 | `version_code`, `version_name`, `sha256`, `url`, `notes` |
| `jobs` | 采集任务与租约 | `name`, `next_run_at`, `leased_until`, `last_result` |
| `health_checks` | 健康采样 | `component`, `status`, `detail`, `checked_at` |
| `settings` | 运行参数 | `key`, `value_json`, `updated_at` |
| `llm_usage` | LLM 调用成本 | `provider`, `model`, `tokens_in`, `tokens_out`, `cost_usd`, `called_at` |

## 4. API 契约

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 用户名密码 → access(15m) + refresh(30d, 存 hash) |
| POST | `/api/auth/refresh` | 轮换 refresh，返回新 access |
| POST | `/api/auth/logout` | 吊销当前会话 |
| POST | `/api/ws/ticket` | 换取 60 秒有效、一次性 WS 票据 |
| WS | `/ws` | `hello{ticket,last_event_id}` → 补发 ≤100 条 → `event`/`ack`/`ping` |
| GET | `/api/dashboard` | 概览聚合（今日事件数、各来源健康、当前持仓摘要） |
| GET | `/api/events` | 分页事件流，支持 `source/symbol/kind/from/to/q` |
| GET | `/api/positions` | 当前持仓（按 venue 分组） |
| GET | `/api/sources` | 来源配置与健康 |
| GET | `/api/alerts` | 告警记录与送达状态 |
| GET/POST | `/api/devices` | 设备列表 / 注册推送 token |
| GET | `/api/app/latest` | 最新 APK 版本与下载地址 |
| GET | `/healthz` | 存活探针 |

## 5. 采集策略

- **Telegram**：Telethon 用户会话（用户主账号，已在 4 个群）。启动时 `catch_up` 并回补最近 200 条/群，之后常驻监听；每 5 分钟按 `min_id` 补洞；监听 `MessageEdited`/`MessageDeleted` 建新版本行；媒体下载到磁盘并记录路径；心跳缺失 10 分钟触发自监控告警。
- **Binance（TG 推断）**：对含仓位语义的消息走规则优先 + LLM 兜底（DeepSeek 抽文本，Qwen-VL 抽截图），产出 `signals(kind=binance_position)`，`confidence` 由规则命中/模型自评给出，UI 标“推断”。
- **OKX**：只读 API key 签名轮询。先 `/api/v5/orbit/top-trader-search` 解析 `authorId`，再轮询 `position-current`（30–60s）、`trade-records`、`position-history`；按 `(instId,posSide)` 做仓位 diff。
- **fomo**：用免费 fomoapi.io key 一次性解析 Solana/Base 钱包地址后落库；之后完全走链上：Solana `getSignaturesForAddress` + `getTransaction`（`pre/postTokenBalances`）、Base `alchemy_getAssetTransfers`/ERC20 `Transfer` 日志；价格用 DexScreener/Jupiter 报价；产出 `chain_transfers` 并合成持仓，标注“链上推断”。
- **X**：twscrape cookie 池（专用小号）每 90 秒拉 `UserTweets`；失败退避并降级 RSSHub；连续失败 30 分钟发运维告警。
- **调度**：APScheduler + `jobs` 表租约，保证多实例不重复执行；失败指数退避。

## 6. 告警与送达

- 主通道：自建 WebSocket → Android 前台服务 → 本地通知（不依赖 FCM，国内可用）。
- 触发规则：仓位变化 `|Δsize|/size ≥ 阈值` 或 `notional ≥ 阈值`（可在设置页调），同一仓位 10 分钟去重合并。
- 兜底：critical 事件 30 秒未 ack → 企业微信机器人；日汇总与严重事件 → 邮件。
- 不使用飞书（历史封禁）。所有通道失败都要落 `alerts` 并进入健康检查。

## 7. 认证与安全

- 单用户账号，密码 Argon2id 哈希；access JWT 15 分钟，refresh 30 天且服务端存哈希可吊销。
- Web 用 HttpOnly + SameSite=Lax Cookie；Android 用系统安全存储保存 refresh。
- WebSocket 必须先换一次性 ticket，避免 token 出现在 URL 查询串被日志记录。
- 服务器：ufw 仅开 22/80/443，fail2ban 保护 SSH，Docker 服务不直接暴露端口。
- 密钥只放服务器 `.env`（权限 600），不进库、不下发前端。

## 8. 部署

- Vultr 大阪 Ubuntu 24.04，Docker Compose（`db`/`api`/`caddy`，采集器与 API 同镜像不同命令）。
- 无域名时用 `<IP>.sslip.io` 让 Caddy 自动签发证书。
- 每日 `pg_dump` 到 `/var/backups/aoying/`，保留 14 天；每月演练一次恢复。
- 国内访问不稳时可加 Cloudflare Tunnel（可选，不阻塞主流程）。

## 9. 增量路线

| 增量 | 内容 | 验收标准 |
| --- | --- | --- |
| I0 | 规格/脚手架/健康检查/文档 | 三端可跑测试，`/healthz` 200 |
| I1 | 登录、设备会话、WS 通道 | Web/App 能登录、断线重连、收心跳 |
| I2 | Telegram 采集 + 时间线 | 4 群消息落库、编辑删除归档、Web 可读 |
| I2.2 | 数据地基（Alembic / sources / jobs / 保留策略） | 迁移可版本化，`create_all` 退役 |
| I3a | 信号解析入库（确定性 parser） | 200 条真实消息重放得 17 仓位 / 96 动作，与人工核对一致 |
| I3b | 影子跟单（不下单） | 零真实委托；滑点/延迟/对账差异有据可查 |
| I3c | AI 语义层（仅否决） | 观点抽取可复核，否决有理由并回链原文 |
| I4 | 实盘执行（单交易所） | 小资金跑通一笔开→加→减→平；kill switch 生效 |
| I5 | 手机确认（半自动） | 手机上能看到信号并一键确认 |
| I6 | 全自动 | 连续 N 天无不合理委托 |
| I7 | 多来源（X / OKX / fomo） | 各自独立验收 |
| I8 | 稳定性与架构债 | 72 小时 soak、备份恢复、APK 分发 |

每个增量结束都停下来交付验收，不自动进入下一个。

## 10. 修订记录

- 2026-11-07 · I2 收口时的实现偏差：
  - 采集器暂与 API 同进程，`worker` 进程与 `LISTEN/NOTIFY` 推迟到 I7；因此 `api` 只跑 1 个 worker。
  - 定时任务用自建 `asyncio` 循环，未引入 APScheduler；I3 定时任务变多时再评估。
  - Telegram 表名保留 `telegram_accounts` / `telegram_dialogs` / `telegram_messages`，不改为本节 §3 的 `raw_messages`；编辑历史另存 `telegram_message_revisions`。
  - 密码仍为 bcrypt(rounds=12)、访问令牌 30 分钟；Argon2id 与 15 分钟推迟到 I7。
  - Web 令牌仍在 localStorage；HttpOnly + SameSite=Lax Cookie 推迟到 I7。
- 增量路线调整为 I2.1 / I2.2 / I3a / I3b，理由见 `docs/backlog.md`。
- 2026-11-07 · **定位变更**：从"只读监控"改为"信号驱动的自动跟单"。§1 目标与非目标已重写，
  §9 路线改为 I3a(解析) / I3b(影子) / I3c(AI 否决) / I4(实盘) / I5(半自动) / I6(全自动) / I7(多来源) / I8(稳定性)。
  方案全文见 `2026-11-07-copy-trading-strategy.md`。
  实施顺序理由：跟单只需 Telegram 信号即可闭环，故多来源（X/OKX/fomo）从 I4–I6 后移到 I7；
  实盘前必须有不下单的影子跟单阶段积累真实滑点与对账数据。
