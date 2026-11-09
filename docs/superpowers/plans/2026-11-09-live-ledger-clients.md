# 双端真实账本接入 Implementation Plan

> 执行方式：Web、Flutter 两个互不重叠的客户端任务并行；主代理审查差异并验证集成。用户已同意先接真实数据、后做视觉优化。

**Goal:** Web 和 APP 的总览、仓位页不再导入演示数据，展示现有 Telegram 信号账本，并在新事件到达时刷新。

**Architecture:** 继续使用已鉴权 REST API 取得账本快照，现有 WebSocket 只承担失效通知。客户端各自封装数据加载、并发控制和错误状态，不添加交易接口。所有金额都是被监控交易员的报送数据，不代表我方余额或真实行情。

**Tech Stack:** FastAPI 现有 API；React 19、TypeScript、Vitest；Flutter、Dart、flutter_test。

---

## 已确定的设计与边界

- 保持当前导航和布局语言，不新建静态设计稿、不换主题。
- 来源标签统一为“Telegram 信号账本”，注明最后信号时间；“实时连接”只指 WebSocket，不保证旧仓位已经与交易所实时对账。
- 四项总览：未平仓数、已平仓数、已平仓累计已实现（USDT）、最后信号时间。使用 `/api/copy/status`，不能从一页仓位反推全局统计。
- 展示最近信号、当前持仓、最近已平仓记录，仓位可展开事件生命周期。
- `/api/positions` 最多获取 100 条，清楚标“最近 100 条以内”，不得声称完整历史。服务端状态筛选与币种筛选可按实际页面复杂度使用，绝不编造交易场所、置信度、行情或日收益。
- 每个仓位 `realized` 已经是累计值，事件的 `realized` 也已经是累计值；不得相加。同理不把所有 `floating` 历史值相加。
- 不存在的数据以“—”或明确说明呈现，不能把 null 转成 0。真实零值保留。
- 加载失败显示错误和重试；刷新失败保留旧数据并标记过期，不能悄悄回退 demo。空数据库和零未平仓都是正常空态。
- 新 `signal.*`、消息编辑/删除以及断线恢复为 live 时重新取快照；忽略 `payload.test === true` 的练习信号对真实账本的失效。
- 初始加载、事件刷新与手动刷新必须防止旧响应覆盖新响应；卸载解绑监听。
- 本次不改后端解析与交易语义、不 rebuild 生产账本、不调用 replay 或交易接口、不主动抢占手机前台。

## Task 1 · Web 客户端

**Files:** `web/src/lib/api.ts`（补全类型与只读方法）；`web/src/lib/ledger.tsx`（集中加载）；`web/src/features/dashboard/DashboardPage.tsx`；`web/src/features/positions/PositionsPage.tsx`；`web/src/App.test.tsx`；新增针对性测试。

- [ ] 写失败测试：真实快照可展示、请求失败可重试、空仓位不展示 demo、0 与 null 不混淆、累计盈亏不求和、signal 到达刷新、重复事件/测试信号不触发无谓刷新、卸载后忽略响应。
- [ ] 运行 `node node_modules/vitest/vitest.mjs run --reporter=dot`，记录预期失败。
- [ ] API 合同：`api.copyStatus(): Promise<ApiCopyStatus>`；`api.positions(options?): Promise<{positions: ApiPosition[]; count: number}>`；`api.signals(options?): Promise<{signals: ApiSignal[]; count: number}>`。复用现有 request/refresh-token 路径，查询参数用 URLSearchParams。
- [ ] 封装快照加载器或 hook，使用请求代次/取消标记控制覆盖顺序；Promise.all 同时取状态、仓位和信号，成功后原子更新。
- [ ] 替换两页演示数据，删除没有真实来源的“场所分布”“行情关注”等模块，保留合适的结构与空态。
- [ ] 执行 `node node_modules/typescript/bin/tsc --noEmit`、Vitest、`node node_modules/vite/bin/vite.js build`，全部通过后交主代理评审。

## Task 2 · Flutter 客户端

**Files:** `app/lib/api.dart`（读取方法）；新增 `app/lib/ledger.dart`（模型与控制器，必要时拆文件）；`app/lib/app.dart`、`app/lib/app_scope.dart`（控制器注入与释放）；`app/lib/screens/dashboard_screen.dart`、`app/lib/screens/positions_screen.dart`；`app/test/` 对应测试。

- [ ] 写失败测试：Dart 模型正确解析 null/0/时间；加载成功/空态/失败；事件刷新和重连恢复；重复事件不刷新；刷新失败保留旧快照；dispose 移除监听且不再 notify。
- [ ] 在 ASCII 路径 `F:\aoying_ascii\app` 下加载 `scripts/android-env.ps1` 后执行 `flutter test`，记录预期失败。
- [ ] 给 ApiClient 添加只读账本方法，沿用 `_send` 的鉴权与错误处理，不能新写裸 HTTP 连接。
- [ ] 新控制器依赖 ApiClient、LiveController；listener 只判定失效，不从通知 payload 重建仓位；处理正在加载时又发生刷新的情况。
- [ ] 注入 AppScope 并在自有对象的生命周期中 dispose，避免影响已有 AlertController。
- [ ] 替换两页，增加加载/错误/重试/空态和生命周期展开。原声音提醒功能不变。
- [ ] ASCII 路径下执行 `dart analyze lib test` 与 `flutter test`，交主代理评审。不并行执行 APK Gradle 构建。

## Task 3 · 集成验收与交付

**Files:** `docs/increments/I4d.md`、`docs/backlog.md`，必要时修改本计划的勾选状态。

- [ ] 主代理审查两端与后端响应字段完全一致，确认无累计盈亏重复求和、无 hardcode 假数、无跨账号数据残留。
- [ ] 用本地已启动后端读取真实 `/api/copy/status`、`/api/positions`、`/api/signals`，对照页面上的数字。不输出 token 或其他凭据。
- [ ] 后端 `python -u -m pytest -o addopts='' -q`、ruff；Web 和 Flutter 全量测试均通过。
- [ ] 设计工作台打开实际 Web 页面并用 check_design 检查 390 和 1280 宽；需要已登录页面时使用独立测试浏览器或可靠会话注入，不把登录页检查冒充业务页检查。
- [ ] Midscene 先确认当前桥健康与会话路由；若桥指向别的会话，明确记录不能把桥健康当 E2E 通过。不向用户要模型 key。
- [ ] Logcat 检查项目包，仅在用户明确允许前台测试时操作项目 APP；不截取或操作其他应用。
- [ ] 记录已经通过和仍未验证的项目，交付这一增量后停下等待用户验收。
