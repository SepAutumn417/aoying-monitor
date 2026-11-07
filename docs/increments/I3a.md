# I3a · 信号解析入库

状态：**待验收**

把机器人发在「熬鹰交易信号」话题里的模板文本，变成可查询、可跟单的结构化数据。
这一层不做任何交易，也不碰交易所——它只负责「把他说的每句话读成账」。
跟单方案见 [跟单策略](../superpowers/specs/2026-11-07-copy-trading-strategy.md)。

## 做了什么

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 解析 | `backend/app/copy/parser.py` | 纯函数，无网络、无 LLM、无 IO。输入消息原文，输出 `ParsedSignal` / `ParsedSnapshot` |
| 建表 | `backend/app/copy_models.py` | `signals` / `positions` / `position_events` 三张表 |
| 入账 | `backend/app/copy/ledger.py` | 信号 → 仓位状态机；幂等；可全量重放 |
| 接口 | `backend/app/api/copy.py` | `GET /api/signals`、`GET /api/positions`、`GET /api/copy/status`、`POST /api/signals/rebuild` |
| 接线 | `backend/app/telegram_collector.py` | `ingest_message()` 在消息入库后、发事件前调 `ledger.ingest_message()`，同一事务 |

解析失败绝不影响消息归档：`ledger` 的异常被捕获后只写一条 warning。

## 一条容易搞错的语义：`已实现盈亏` 是累计值

减仓消息里的 `已实现盈亏` 不是「这一单赚了多少」，而是**该仓位从开仓到此刻的累计已实现**。
证据是 ZECUSDT 多单（2026-10-02 → 10-05）四次落袋依次报：

```
-62,851.70 → -136,850.23 → -173,895.41 → -214,696.67
```

单调累积，且最后一次等于该仓位的最终 `realized`。所以：

- **绝不能把各事件的 `realized` 相加**；
- 仓位终值 = 最后一个事件的 `realized`；
- 界面上「本段落袋」必须用相邻两个累计值相减推出来，不能直接取字段。

`copy_models.py` 的模块注释里写了同样的话，附了这四个数字。

## 三张表

- **signals**：一条消息一条记录，`(dialog_id, message_id)` 唯一。存 `kind`（`open`/`add`/`reduce`/`close`/`leverage`）、币种、方向、杠杆、数量（开仓量 / 原仓位 / 现仓位）、价格、保证金、强平价、浮动、已实现、上报时间。
- **positions**：一个「回合」一条记录，由 `open` 信号创建，`close` 信号关闭。`status` 只有 `open` / `closed`。
- **position_events**：每个动作一行，指回 `signals.id`（唯一，一个信号最多产生一个事件）。

## 怎么自己验证

```bash
cd backend && python -m pytest tests/test_copy_parser.py -q
```

其中 `test_rebuild_replays_the_real_archive` 会读生产库 `aoying.db`（只读模式），把 200 条真实消息灌进测试库后全量重放。库不在时自动 skip。

想直接看结果，起服务后：

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/copy/status
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/positions?status=closed"
```

## 实测结果

全量重放 200 条真实消息：

| 指标 | 结果 |
| --- | --- |
| 解析出的信号 | **100** 条（open 17 / add 43 / reduce 14 / close 18 / leverage 8） |
| 快照 | 100 条（只解析、不建仓位） |
| 未能解析 | **0** |
| 仓位 | **17** 个，全部已平 |
| 动作 | **96** 次 |
| 累计已实现 | **+800,776.04 USDT** |

96 而不是 100 的原因：最早那笔 ZECUSDT 多单的**开仓**发生在采集窗口之前，它的加仓/减仓/减仓/平仓 4 条找不到对应仓位，按设计**只存信号、不建事件**（否则会凭空造出一个仓位）。这 4 条里包含一笔 −9,822.74 的平仓，所以不计入 17 仓合计。

测试：`61 passed`（后端全量，含 I3a 新增 12 条）；`ruff check` 全绿。

## 已知限制

1. **只认「熬鹰交易信号」话题（`topic_id=926111`）的模板文本。** 群里闲聊、别人的发言、旧格式一律不解析（返回 `None`，不报错）。
2. **快照不入账。** `熬鹰当前全部持仓` 只解析成 `ParsedSnapshot`，用于 I3b 的对账校验，不写表。
3. **消息被编辑后不会重算。** `ledger` 按 `(dialog_id, message_id)` 幂等，同一 message_id 再来一次直接返回原信号。机器人的信号不编辑（只有快照会被反复编辑），所以当前无影响；真要支持，需要 `POST /api/signals/rebuild` 全量重放。
4. **孤立信号只留痕。** 找不到开仓的加/减/平不建仓位、不建事件，日志里是 `debug` 级别。
5. **建表仍靠 `create_all`。** 版本化迁移在 I2.2。
6. **`C_h`（熬鹰总本金）目前是估算值** 1,287,377 USDT，取自历史快照里最大的 `总保证金`。它只影响 I3b 的跟单比例，不影响本增量的任何数字。

## 下一步

**I3b 影子跟单**：按 `实际开单倍数 = 名义价值 ÷ 本金` 等比换算成我方下单量，模拟成交并在界面上给出对照表——**不下任何真实委托**。跑够一段时间、把滑点和延迟统计出来，再谈 I4。
