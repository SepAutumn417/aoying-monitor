# I4a · Bitget 只读接入（查余额、查合约规格、不碰钱）

状态：**待验收**

## 这一版解决什么

I3b 的定标公式里有两个输入还是假的：

| 输入 | I3b 的做法 | 问题 |
| --- | --- | --- |
| 我方权益 | 配置里写死 `COPY_EQUITY_USDT=1000` | 用户的原话是「你可以看到里面有多少钱，根据合约账户里的金额做单就好了」。写死就是没做到。 |
| 合约精度 | `contracts.py` 里只有三个币种的静态表 | 熬鹰跟过 8 个币种。剩下 5 个按默认 0.001 步长算，可能算出交易所根本不接受的量。 |

I4a 把这两个输入换成**实时读数**，并且**只读**——这一版里没有任何下单、改杠杆、划转的代码路径。

## 做了什么

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 交易所适配器 | `backend/app/copy/bitget.py` | `BitgetClient` 只暴露三个 GET：`accounts()` / `positions()` / `contracts()`。签名用 `httpx.URL` 一次构造，签的是**实际发上线的 raw_path**，所以 query 的编码方式不会和签名对不上。 |
| 翻译层 | `backend/app/copy/account.py` | `equity_of()` 从 `marginCoin=USDT` 那行取 `accountEquity`；`spec_of()` 把 `sizeMultiplier` / `minTradeNum` / `pricePlace` 变成 `ContractSpec`；`ContractBook` 区分「实测」和「回落默认」。 |
| 配置 | `backend/app/config.py` | `BITGET_API_KEY` / `BITGET_SECRET` / `BITGET_PASSPHRASE` + `bitget_configured`。 |
| 定标 | `backend/app/copy/sizing.py` | `size_for(..., book=ContractBook)`：有实测规格就用实测，没有才回落到静态表。 |
| 决策 | `backend/app/copy/planner.py` | `plan_signal(..., contracts=)` / `replay(..., contracts=)` 把合约册透传下去。 |
| 接口 | `backend/app/api/copy.py` | 新增 `GET /api/copy/account`；`POST /api/copy/replay` 改为读实时权益。 |

### 三条刻意的选择

**1. 配了凭证但读不到钱，就报错，不回落。**

`resolve_equity()` 只在「完全没有凭证」时才用 `COPY_EQUITY_USDT`。一旦配了 key 却读不到权益，
它抛 `EquityUnavailable`，replay 返回 409。理由写在 docstring 里：*静默用旧常数定标，就是实盘下错尺寸的方式*。
影子阶段无所谓，但这条路径将来是要接实盘的，现在就得是同一个行为。

**2. 静态表永远不许自称「实测」。**

`ContractBook.spec_for()` 返回 `(spec, measured)`。命中 `contracts.py` 里的静态表时 `measured=False`——
那张表虽然来自一次真实的 `futures_get_contracts` 调用，但它是**快照，不是当前读数**。
（这里踩过一个 bug：else 分支原本直接 `return spec_for(symbol)`，把静态命中报成了 `measured=True`，
两条测试当场抓到。）

**3. 错误只暴露本地 code。**

`BitgetError` 只带 `not_configured` / `http_error` / `network_error` / `invalid_response` / `api_error` 五种，
**不保留上游的 body、msg、也不保留凭证**，且 `raise ... from None` 切断异常链。
测试里用 `secret-sentinel` 这类哨兵字符串反查，确认它不会出现在 `str(error)`、`repr(error)` 或完整 traceback 里。

## 怎么自己验证

```powershell
cd F:\AOYING交易监控\backend
python -m pytest tests/test_bitget.py tests/test_bitget_account.py tests/test_copy_account_api.py -q
python -m pytest -q                                  # 全量 144 条
python -m ruff check app tests ../scripts
```

## 接口

### `GET /api/copy/account`

告诉我方现在会拿什么数去定标，以及这个数从哪来。

```json
{
  "configured": false,
  "source": "config",
  "equity": 1000.0,
  "detail": "bitget_not_configured",
  "contracts_measured": 0,
  "contracts_assumed": []
}
```

| 字段 | 含义 |
| --- | --- |
| `configured` | 三个凭证是否齐 |
| `source` | `bitget` = 实时读数；`config` = 影子阶段的替代值 |
| `equity` | 读不到时是 `null`，**不编一个数字** |
| `detail` | 本地错误码，或 `bitget_not_configured` |
| `contracts_measured` | 本次真正从交易所读到的合约条数 |
| `contracts_assumed` | 回落到静态表 / 默认值的币种 |

### `POST /api/copy/replay`

```json
{"equity": 5000}   // 可选；给了就用它，且完全不访问交易所
```

响应在原有四个字段上加了 `equity` / `equity_source` / `contracts_measured` / `contracts_assumed`，
这样一眼能看出这次重放是按什么数算的。

| 情况 | 行为 |
| --- | --- |
| 请求体给了 `equity` | 直接用它，`equity_source="request"`，不发任何网络请求 |
| 没配凭证 | 用 `COPY_EQUITY_USDT`，`equity_source="config"` |
| 配了凭证、读得到 | 用实时权益，`equity_source="bitget"`，并加载实测合约册 |
| 配了凭证、读不到 | **409**，`detail` 是本地错误码 |
| 权益读到了但合约读不到 | **502**，不拿半个合约册去算 |

## 已知限制

1. **还没有真实凭证跑过。** 这一版的交易所路径全部由 `httpx.MockTransport` 覆盖（44 + 19 + 7 条测试），
   签名算法和响应解析都验过，但没有对着真实账户发过一次请求。第一次接真 key 时要盯 `GET /api/copy/account` 的输出。
2. **只读，没有对账。** `positions()` 已经能拉到真实持仓，但「我方实际持仓 vs 熬鹰快照」的比对还没做（I4b）。
3. **没有资金费率、手续费、滑点。** 定标仍是「名义 = 实际杠杆 × 权益」，成本没进模型。
4. **合约册没有缓存。** 每次 replay 都重新拉一次 `contracts`。实盘阶段要加 TTL，否则每个信号都多一次往返。
5. **`accountEquity` 含未实现盈亏。** 这是用户要的口径（「合约账户里的金额」），但意味着浮亏时我方会自动缩小仓位。
   这是等比跟单的正确行为，不是 bug，但值得知道。

## 下一步

I4b 对账：拉 Bitget 真实持仓，和熬鹰最新快照逐仓比对，输出差异表。
仍然不下单——先把「我以为的持仓」和「实际持仓」对齐，实盘才有意义。
