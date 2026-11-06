# 待办池

按“下一个增量是否需要”排序；每条都要能独立验收。

## 已确认要做（按增量）

- **I1**：登录/刷新/登出、设备注册、WS ticket + 断线重连、心跳与在线状态。
- **I2.1（本轮）**：Telegram 4 群采集收口 —— 回补最近 200 条、每 5 分钟补洞、编辑历史两版可查、删除打戳、媒体落盘、时间线按来源/类型/时间筛选。
- **I2.2**：数据地基 —— Alembic 首版迁移、`sources` 表（五个来源统一状态）、`jobs` 表与租约、`events` 保留策略。
- **I3a**：Binance 仓位抽取（规则 + DeepSeek + Qwen-VL）→ `signals` / `positions` / `position_events`，持仓页接真实数据、按币种筛选。
- **I3b**：Android 前台服务 + 本地通知 + 告警去重合并（前置：本机装 JDK 与 Android SDK，否则只交付代码与待真机清单）。
- **I4**：OKX 只读 key 接入、authorId 解析、持仓/成交轮询、仓位 diff。
- **I5**：fomo 钱包解析、Solana/Base 链上轮询、代币变动合成持仓、换手事件。
- **I6**：X twscrape 轮询、帖子入时间线、失败降级与运维告警。
- **I7**：架构债集中偿还 —— 采集器拆独立 `worker` 进程、Postgres `LISTEN/NOTIFY` 事件总线、企业微信 + 邮件兜底、送达重试与 ack、自监控、Web 令牌改 HttpOnly Cookie。
- **I8**：72 小时 soak、备份恢复演练、APK 分发与版本检查。

拆分理由：I2 的采集链路已经能跑，但缺编辑历史与定时补洞，先把验收补齐（2.1）；数据迁移动手越晚越贵，先打地基（2.2）；Binance 推断链路长，拆成「抽取落库」与「推送通知」两段，前者不依赖 Android SDK。

## 待用户确认 / 可能调整

- 熬鹰的 X handle 是否为 `@thankUcrypto_`（目前依据 Bitget/OKX Orbit 页面推断）。
- 4 个 Telegram 群的具体链接或 chat_id。
- OKX 是否有公开实盘主页可直接抓（若有，可省掉 API key）。
- fomo 的 handle 与两条链上的钱包地址（若 fomoapi 免费额度解析不出，需要手工提供）。
- 告警阈值默认值（当前 1% / 50 USD / 10 分钟去重）是否符合实际节奏。
- 是否需要“只在我关注币种变化时提醒”的白名单机制。

## 明确不做（记录以免反复讨论）

- Windows 桌面原生应用、iOS 客户端。
- 用飞书机器人做主通道。
- 订阅 twitterapi.io / fomoapi.io 付费档（当前走零成本路线）。
- 任何下单、转账、提现相关能力。
