# 熬鹰资本监控系统 · 实施计划

日期：2026-11-05
设计文档：`docs/superpowers/specs/2026-11-05-aoying-react-flutter-design.md`

## 目标

用 9 个可独立验收的增量，把“熬鹰资本的交易动作与公开发言”变成一个只读监控产品：
境外服务器常驻采集 → 统一时间线 → 仓位变化秒级推送 Android 与 Web。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Python 3.12、FastAPI、SQLAlchemy 2（async）、Alembic、PostgreSQL 16、APScheduler、httpx |
| 采集 | Telethon（Telegram）、twscrape（X）、OKX 只读 API、Solana/Base RPC |
| 抽取 | 规则优先 + DeepSeek（文本）+ Qwen-VL（截图） |
| Web | React 19、Vite 6、Tailwind 4、react-router-dom 7 |
| Android | Flutter 3.50（Dart 3.13）、Material 3、前台服务 + 本地通知 |
| 部署 | Docker Compose、Caddy（自动 HTTPS）、Vultr 大阪 Ubuntu 24.04 |

## 交付纪律

- 每个增量：先写/改测试 → 实现 → 测试通过 → 本地跑起来给用户看 → **停下等验收**。
- 增量之间不预埋下一个增量的功能；不为了“看起来完整”造占位数据。
- 用户反馈优先于计划：需求在开发中持续细化，计划随验收结果调整。
- 所有外部依赖（凭据、账号）缺失时，该增量降级为“可本地验证的部分 + 待接入清单”，不阻塞已完成部分。

## 增量拆解

### I0 · 规格与脚手架（本次）

1. `backend/`：FastAPI 应用 + `/healthz` + `/api/health`，配置从环境变量读取，2 个测试。
2. `web/`：Vite + React + Tailwind，路由（登录/总览/时间线/持仓/告警/来源/设置），深色监控风格，1 个测试 + 可构建。
3. `app/`：Flutter Android 骨架，登录占位 → 底部五栏，深色主题，2 个组件测试。
4. `docs/`：设计说明、实施计划、I0 验收说明、待办池、设计 token。
5. 根目录：`README.md`、`.gitignore`、`.env.example`、`docker-compose.yml`、`deploy/Caddyfile`。

**验收**：`python -m pytest` 通过；`npm test` + `npm run build` 通过；`flutter test` + `dart analyze` 通过；`/healthz` 返回 ok；README 能照着跑起来。

### I1 · 登录、设备与实时通道

- 表：`users`、`devices`、`device_sessions`、`ws_tickets`。
- API：`/api/auth/login|refresh|logout`、`/api/ws/ticket`、`/api/devices`。
- WS 网关：`hello{ticket,last_event_id}` → 补发 ≤100 条 → `event/ack/ping`；断线指数退避重连。
- Web：真实登录页 + 路由守卫 + 顶栏在线状态；Android：安全存储保存 refresh、前台服务建立 WS。
- **验收**：Web 登录后刷新仍在线；App 杀进程重开自动重连；服务端重启后 30 秒内恢复。

### I2 · Telegram 采集与时间线

- Telethon 用户会话，4 群；启动回补 200 条/群，每 5 分钟按 `min_id` 补洞。
- 编辑/删除建版本行；媒体落盘；心跳缺失 10 分钟告警。
- Web 时间线接真实数据，支持来源/币种/类型/时间筛选与关键词搜索。
- **验收**：群里发一条消息，Web 10 秒内可见；编辑后能看到两版；断网 5 分钟恢复后不丢消息。

### I3 · Binance 抽取与 Android 通知

- 规则抽取（关键词/正则/结构化格式）+ LLM 兜底（DeepSeek 文本、Qwen-VL 截图）。
- `signals` → `positions(venue=binance)` → `position_events` → 推送。
- Android 前台服务本地通知，点开进详情；10 分钟去重合并。
- **验收**：发一条典型仓位消息，手机 30 秒内收到通知；重复消息不刷屏；截图消息也能抽出来。

### I4 · OKX 只读接入

- 只读 key 签名客户端；`top-trader-search` 解析 authorId；`position-current`/`trade-records`/`position-history` 轮询。
- 按 `(instId,posSide)` 做 diff，产出仓位事件；失败退避 + 健康记录。
- **验收**：持仓页出现 OKX 分组；仓位变化 60 秒内出事件与推送。

### I5 · fomo 链上接入

- 免费 key 一次性解析钱包 → `chain_wallets`；之后走 RPC。
- Solana `getSignaturesForAddress`/`getTransaction`；Base `alchemy_getAssetTransfers` + ERC20 Transfer。
- DexScreener/Jupiter 报价合成 USD；换手事件入时间线，标“链上推断”。
- **验收**：目标钱包发生一笔 swap，2 分钟内可见事件与估值。

### I6 · X 接入

- twscrape cookie 池，90 秒轮询 `UserTweets`；失败退避、降级 RSSHub；连续失败 30 分钟运维告警。
- 帖子入时间线，支持原文链接跳转。
- **验收**：发一条推，90 秒内出现在时间线。

### I7 · 兜底通道与可靠性

- critical 30 秒未 ack → 企业微信；日汇总/严重 → 邮件；重试与送达状态落库。
- 自监控：采集器心跳、队列积压、DB 连接、磁盘；异常自愈与告警。
- **验收**：模拟 App 离线，critical 事件走兜底并在告警页可见。

### I8 · 上线 soak

- 72 小时连续运行；统计延迟分位、丢消息数、重连次数。
- 备份恢复演练；APK 分发与版本检查；运维手册。
- **验收**：72 小时无人工干预；恢复演练成功。

## 风险与对策

| 风险 | 对策 |
| --- | --- |
| Telegram 吞消息/断线 | `catch_up` + 定时补洞 + 心跳告警；主账号会话失效时提前提醒重新登录 |
| 主账号被风控 | 只读监听、低频请求、不做批量操作；必要时改用小号并重新加群 |
| X cookie 失效 | 降级 RSSHub + 运维告警 + 明确提示需重新导出 cookie |
| OKX 接口变更 | 封装客户端 + 契约测试；失败退避并保留上次快照 |
| 链上解析误判 | 只展示“余额变化 + 交易哈希”作为证据，估值标“推断” |
| 服务器国内可达性 | 优先直连；不稳时启用 Cloudflare Tunnel |
| LLM 成本/误抽 | 规则优先、限流、记录 `llm_usage`；置信度低于阈值只入库不推送 |
