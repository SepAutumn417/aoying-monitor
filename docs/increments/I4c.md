# I4c · 实时信号推送（开仓那一刻，网页和手机一起响）

状态：**待验收**

## 这一版解决什么

采集、解析、定标都做完了，但**信号只进了数据库**。熬鹰开仓时：

| 之前 | 问题 |
| --- | --- |
| 后端只发 `telegram.message` 事件 | 客户端收到的是一段原始文本，得自己再解析一遍才知道是开仓还是平仓。 |
| Web 的「提醒」页是 `demoAlerts` 静态数组 | 页面上那几条是写死的示例，标着「示例数据」，跟真实信号没有关系。 |
| Flutter 的「提醒」页同样是 demo | 同上，底部「送达通道」写着 Android App「未接入」。 |
| 没有任何声音 | 手机放桌上、浏览器开在后台时，人不会一直盯着看。 |

I4c 补的是方案里 **L8 通知**那一层：`signal.*` 事件从采集器直接发出，两端各自渲染成卡片并**按动作播不同的声音**。

## 做了什么

| 层 | 文件 | 说明 |
| --- | --- | --- |
| 事件构造 | `backend/app/copy/notify.py` | 把一条 `Signal` 变成事件 kind + payload。纯函数，无 IO。 |
| 入库即推送 | `backend/app/copy/ledger.py` | `ingest_result()` 多返回一个「是否首次创建」，编辑与回补不会重复推送。 |
| 发送 | `backend/app/telegram_collector.py` | 在同一个事务里先发 `telegram.message`，再发 `signal.<action>`。 |
| 试听端点 | `backend/app/api/devices.py` | `POST /api/events/test?action=close` 发一条形状与真实信号完全相同的测试信号。 |
| Web 数据层 | `web/src/lib/signals.ts` | `toSignalAlert()` / `mergeSignalAlerts()` / `countByAction()`。 |
| Web 声音 | `web/src/lib/sound.ts` | Web Audio 实时合成，仓库里没有任何音频文件。 |
| Web 状态 | `web/src/lib/alerts.tsx` | 去重、防噪、未读、静音、播放被拦的提示。 |
| Web 界面 | `AlertsPage.tsx` / `SignalToast.tsx` / `AppLayout.tsx` | 信号中心、右下角浮卡、导航未读气泡与静音开关。 |
| Android 数据层 | `app/lib/signals.dart` | 与 Web 同构的 `SignalAction` / `SignalAlert` / `toSignalAlert()`。 |
| Android 声音 | `app/lib/sound.dart` | 运行时合成 16-bit PCM WAV，`audioplayers` 播放，同样无 assets。 |
| Android 状态 | `app/lib/alerts.dart` | 与 Web 同一套防噪规则。 |
| Android 界面 | `alerts_screen.dart` / `home_shell.dart` / `settings_screen.dart` | 信号中心、导航角标、试听按钮。 |

### 四条刻意的选择

**1. 动作编码在事件 kind 里，不是只放在 payload 里。**

事件 kind 就是 `signal.open` / `signal.add` / `signal.reduce` / `signal.close` / `signal.leverage`。
客户端只看 kind 就能选声音，不用解析任何数字；将来「只关心平仓」的订阅可以直接按 kind 过滤，不必先解 JSON 再判断。

**2. 数字只拷贝，绝不重算。**

`realized` 是机器人对**该仓位**的累计值（见 `app/copy_models.py` 的 docstring），`qty_after` 是权威值。
客户端如果拿「收到的事件」自己累加，一旦漏掉一条就会算错——而且偏偏在漏事件的时候最需要它准确。
所以 `notify.signal_payload()` 原样搬运，前端也**不重新格式化**中文措辞：`headline` / `summary` 由 `notify.py` 独占，
第二套格式化必然与第一套漂移。

**3. 五种声音在音高和节奏两个维度上都不同。**

| 动作 | 波形 | 音高 | 节奏 |
| --- | --- | --- | --- |
| 新开仓 | triangle | 784 → 1046 Hz（上行） | 双音 |
| 加仓 | sine | 1175 Hz | 单响 |
| 减仓 | triangle | 880 → 659 Hz（下行） | 双音 |
| 平仓 | sine | 392 → 294 Hz（低音） | 双击 |
| 调杠杆 | square | 1318 Hz | 极短轻点 |

只靠音高区分，在手机小喇叭、低音量、环境噪音下会塌陷；加上节奏差异后才真的「不看屏幕也能分辨」。
两端的音符表是各自独立的实现（Web 用振荡器，Android 用 PCM 合成），但形状一致，测试各自断言五种签名互不相同。

**4. 重放历史不响，一批只响一次。**

首次连接时 socket 会补发最近 100 条事件，其中可能有几十条历史信号。如果照单全响，用户第一次打开页面就被轰炸。
所以第一条非空批次只用来设游标，不响铃；之后每批最多响一次，取 `open > close > add > reduce > leverage` 里最响的那个。
批量到达时（比如一次补了三条）只响最需要被听见的那条。

### 测试信号为什么也响

设置页的「提示音试听」发的是**真实链路**：`POST /api/events/test?action=close` → 事件表 → WebSocket → 客户端播放。
所以它必须真的响——本地放个音不证明任何事。测试信号保持无害靠另外三件事：

- symbol 用 `TESTUSDT`，任何交易所都不会有；
- headline 带「测试 ·」前缀；
- `test: true`，两端据此打「测试」徽标，并且**不计入未读**。

## 怎么自己验证

```powershell
cd F:\AOYING交易监控\backend
python -m pytest tests/test_signal_push.py -q     # 21 条
python -m pytest -q                               # 全量 165 条
python -m ruff check app tests ..\scripts

cd F:\AOYING交易监控\web
node node_modules/vitest/vitest.mjs run --reporter=dot   # 24 条
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build

# Flutter 必须在 ASCII 路径下跑，中文路径会把着色器编译器的路径撕裂
cd F:\aoying_ascii\app
& F:\aoying_ascii\.tools\flutter\bin\flutter.bat test    # 33 条
```

手动验一遍：

1. 起后端与 Web，登录。
2. 设置页点五个「提示音试听」按钮，应依次听到上行双音、高音单响、下行双音、低音双击、轻点。
3. 提醒页应出现五条带「测试」徽标的记录，导航上**不出现未读气泡**。
4. 让采集器收到一条真实信号（或直接往库里灌一条真实格式报文），两端应在一秒内出现卡片并响对应声音。

## 接口

### 事件

| kind | 触发 |
| --- | --- |
| `signal.open` | 新开仓 |
| `signal.add` | 加仓 |
| `signal.reduce` | 减仓 |
| `signal.close` | 平仓 |
| `signal.leverage` | 只调杠杆，仓位数量不变 |

payload 关键字段：

| 字段 | 含义 |
| --- | --- |
| `action` / `action_label` | `close` / `平仓` |
| `symbol` / `side` / `side_label` | `ZECUSDT` / `long` / `多` |
| `leverage` / `leverage_from` / `leverage_to` | 目标杠杆；调杠杆时用后两个 |
| `qty` / `qty_before` / `qty_after` | 本次数量、动作前、动作后 |
| `entry` / `mark` / `liq` | 开仓均价、标记价、强平价 |
| `realized` / `floating` | **该仓位的累计**已实现盈亏、当前浮盈亏 |
| `headline` / `summary` | 已经排版好的两行中文，客户端直接显示 |
| `test` | 是否为试听信号 |

### `POST /api/events/test`

| 情况 | 行为 |
| --- | --- |
| 不带 `action` | 发 `system.test`，不触发信号声音（保留给「系统通知」按钮） |
| `?action=close` | 发 `signal.close` + `test: true`，两端会真的响 |
| `?action=nope` | **422** |

## 已知限制

- **手机端没有后台通知。** App 退到后台后 WebSocket 会被系统挂起，声音只在应用处于前台时可靠。真正的后台推送需要 Android 前台服务 + 本地通知，那是 I5。
- **Web 的浏览器标签页在后台时，声音可能被浏览器节流。** 播放失败会如实显示「声音被拦」提示，而不是假装响过了。
- **没有桌面通知 / 系统通知中心。** 目前只有应用内卡片与声音。
- **声音是合成的，不是专业音效。** 好处是零 assets、零加载延迟、可单测；坏处是听感朴素。
- **未读状态只在内存里。** 刷新页面后未读清零，没有做服务端已读游标。
- **没有对「推送丢失」做主动补偿。** 依赖 WebSocket 重连时的 `last_event_id` 补洞；如果客户端离线很久，只能补最近 100 条。
