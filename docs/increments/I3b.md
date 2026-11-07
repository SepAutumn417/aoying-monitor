# I3b · 影子跟单（只算不下单）

状态：**待验收**

## 这一版解决什么

I3a 已经能把机器人的信号解析成「他开了什么仓、什么价、多大」。但「我要下多大」还没答案。
I3b 就是把这个答案算出来，并且**一分钱都不动**——所有决策都记在 `copy_intents` 表里，可以逐条拿来看，
就像先在纸上把整段历史跟一遍。

## 定标口径（用户 2026-11-07 定稿）

不是照抄他的杠杆倍数，也不是估算他的本金，而是**照抄他的「实际杠杆」**：

```
我方名义价值 = 他的实际杠杆 × 我方合约账户权益
我方下单数量 = 我方名义价值 ÷ 标记价格（向下取整到合约步长）
```

理由是他自己说的那句：「他多少爆仓，我就得差不多多少爆仓」。实际杠杆相同，
就意味着**保证金占权益的比例相同，强平价到现价的百分比距离也相同**。
我本金小，只会让我仓位小，不会让我离爆仓更近。

杠杆档位照抄他消息里的 `币种：XXX 永续 | 全仓 | Nx`，保证金模式 `crossed`（全仓）。
权益在每次动作前从 Bitget `USDT-FUTURES` 账户读 `accountEquity`（I4 接；现在由请求参数或配置给）。

## 做了什么

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 合约精度 | `backend/app/copy/contracts.py` | `ContractSpec.floor_qty()` 向下取整到步长网格，**绝不向上**。只收录实测过的 BTCUSDT / ETHUSDT / SNDKUSDT；未收录的走默认值并在 note 里打 `contract_spec_assumed` |
| 定标 | `backend/app/copy/sizing.py` | `size_for(equity, lev_actual, price, symbol, closing)`，纯函数，无网络 |
| 决策 | `backend/app/copy/planner.py` | `plan_signal()` 一信号一意图；`replay()` 按时间重放整本历史账 |
| 表 | `backend/app/copy_models.py` | 新增 `copy_positions`（我方影子持仓）与 `copy_intents`（每笔拟下单） |
| 接口 | `backend/app/api/copy.py` | `GET /api/copy/intents`、`GET /api/copy/book`、`POST /api/copy/replay` |
| 配置 | `backend/app/config.py` | `COPY_MODE`（默认 `shadow`）、`COPY_EQUITY_USDT`（默认 1000）、`COPY_PAUSED` |

### 幂等与自愈

- `copy_intents` 上有 `UniqueConstraint("signal_id", "stage")`：同一条信号在同一个阶段只会有一次决策，
  重复投递、重放、进程重启都不会重复下单。
- 定标是**目标值**而不是增量：每次动作都重算「我该持有多少」，执行器再取与实际持仓的差。
  所以漏一条信号、被拒一次单，下一条信号会自动拉回来，不会留下永久偏移。

### 平仓怎么算钱

他的 `已实现盈亏` 是**该仓位的累计值**（I3a 已确认，不能求和）。所以我方已实现 =
`他的累计盈亏 ÷ (他的开仓均价 × 他的开仓数量) × 我方平仓时的名义价值`。
先把他的绝对金额换成「本金收益率」，再乘我方的仓，这样两边是同比例的。

## 怎么自己验证

```powershell
cd F:\AOYING交易监控\backend
python -m pytest tests/test_copy_planner.py -q      # 13 条
python -m pytest -q                                  # 全量 74 条
```

`test_shadow_replay_of_the_real_archive` 会读生产库 `aoying.db`（只读模式打开），
把交易区 200 条真实消息灌进测试库，重放整本历史账，断言：

- 100 条信号 → 100 条意图
- 4 条找不到开仓仓位的「孤儿信号」被跳过（`no_open_position`）
- 影子账本 17 个仓位，全部已平
- 按 1000 USDT 权益、照抄实际杠杆跟下来，累计已实现 **+8,866.08 USDT**

## 实测结果（2026-11-07，本机）

权益 1000 USDT、全部按实际杠杆等比：

| 币种 | 方向 | 杠杆 | 我方已实现 (USDT) |
| --- | --- | --- | --- |
| ETHUSDT | 空 | 20x | **+5,005.25** |
| SNDKUSDT | 多 | 3x | +2,737.48 |
| ZECUSDT | 多 | 5x | +1,581.79 |
| ETHUSDT | 空 | 20x | +492.45 |
| BTCUSDT | 空 | — | +261.32 |
| BTCUSDT | 空 | — | +147.26 |
| HYPEUSDT | 空 | 5x | +106.01 |
| CLUSDT | 空 | 5x | +86.64 |
| ETHUSDT | 空 | 15x | +83.45 |
| CRCLUSDT | 空 | 5x | +25.73 |
| BTCUSDT | 多 | 5x | +11.80 |
| SNDKUSDT | 多 | 2x | +2.47 |
| ETHUSDT | 多 | 10x | −89.47 |
| ZECUSDT | 多 | 5x | −221.36 |
| ETHUSDT | 空 | 10x | −448.28 |
| BTCUSDT | 空 | 10x | −451.34 |
| MUUSDT | 多 | 5x | −465.12 |
| **合计** | | | **+8,866.08** |

⚠️ 1000 本金赚 8866，看起来是 8.9 倍，这不是 bug：熬鹰这些仓的实际杠杆普遍 5x～20x，
满仓跟下来本金翻几倍是正常的；反过来说他那几个亏损单（−296,685、−287,525）如果踩上，
按同样比例我方也会亏掉接近全部本金。**这一版的意义就是把这件事先摆出来看。**

## 已知限制

1. **只有三个币种有实测合约精度**，其他币种按默认 0.001 步长算，意图上会标 `contract_spec_assumed`。
   I4 接上 `futures_get_contracts` 后应改为全部实测。
2. 权益是给死值（1000），还没接 Bitget 真实余额。
3. 滑点没算：用信号里的标记价，实际成交会差一点。I4 才有真实成交价。
4. 4 条孤儿信号（最早那笔 ZECUSDT 的开仓在采集窗口之前）不建仓，只留意图记录。
5. 没有资金费率、没有手续费。等比跟单这类成本会吃掉一部分。
6. 只做了单向持仓假设；如果 Bitget 账户是双向持仓模式，下单参数要改（I4 处理）。

## 下一步

I4a 接 Bitget 只读：查余额、查合约规格、拉真实持仓做对账。
需要用户提供 API Key + Secret（只勾合约交易、禁提现、绑 IP 白名单）。
