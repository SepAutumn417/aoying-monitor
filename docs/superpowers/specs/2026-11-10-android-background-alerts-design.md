# 安卓后台／锁屏提醒设计

## 目标与已批准范围

用户已选择 A：常驻前台服务，在后台／锁屏时接收仓位信号并发系统通知；不接 FCM 或厂商推送。保留当前已上线 Web，不替换设计原型，不启用实盘交易。

成功标准不是“代码编译通过”：必须有后台状态、锁屏系统通知、重连去重和登出停止的验收证据。未经用户允许不切换手机前台，不声称实际听音或锁屏验收通过。

## 架构

采用原生 Kotlin foreground service + OkHttp WSS，通过 Flutter MethodChannel 接入已有登录壳。服务独立于 Activity 的 Dart 界面生命周期，但不绕过 Android 后台限制。通知状态可在现有设置页查看和重新申请权限，不重做页面。

- 登录且通知权限已允许：从可见 Activity 启动服务，立即显示常驻“信号监控运行中”通知，再建立 WSS。
- 前台：现有 Flutter 界面继续刷新真实 REST 账本、应用内提醒；原生系统交易通知抑制，避免一条信号双响。
- 后台／锁屏：服务处理五种 signal.open/add/reduce/close/leverage，使用系统通知通道展示后台已格式化的 headline/summary。test 事件必须显式标注，不能伪装实盘；普通 telegram/device 事件不触发交易通知。
- 通知点击只打开本应用，不触发交易。退出账号立即停服务、清凭据和游标、取消相关通知；迟到网络结果用 generation 丢弃。

## 认证：禁止两个刷新者竞争

后端 refresh 是一次性旋转令牌。不能让原生服务与 Flutter 使用两份相同 refresh 各自刷新，也不能让登录退出仍在途的旧请求恢复旧令牌。

Android 新增单一原生 SessionCoordinator：持有同一会话的 access/refresh/user/device，串行执行刷新；刷新者提供 expected access，若已被其他请求更新则复用新结果。Flutter Android 的保存／恢复／刷新／注销和服务取票均经该协调器；非 Android 及隔离测试保留现有可注入 HTTP 实现。

refresh 等持久会话以 Android Keystore AES-GCM 加密保存，禁止写日志、通知或明文 Intent；支持首次迁移既有 SharedPreferences refresh，成功后删除旧明文项。注销先使 generation 失效并本地清除，再用旧会话快照向服务端撤销。登录、注销、刷新请求的迟到结果都不得覆盖新会话。

## WSS、游标与去重

沿用线上同源 `/api/ws/ticket` 与 `/ws`，仅 HTTPS/WSS，证书正常校验。保留旧版 hello/ping/pong/replay；新增可选 protocol_version=2：服务端按固定水位分页补洞并发 replay_complete，旧客户端默认协议1不受影响。原生客户端在补洞完成前缓冲 live 事件，再按 ID 合并推进游标，防止并发 live 的较大 ID 跳过离线记录。

- 按会话身份持久化 last_event_id；正常重连发送游标，重复事件不重复通知。
- 首次没有游标时以 server hello 的 last_event_id 为静默基线，不把历史账本响成新交易。
- replay 按 ID 升序推进；过旧补发只用于补齐/摘要，不连续轰炸旧信号；允许最多一条明确“离线期间有新信号”的系统摘要。
- 网络异常指数退避（1–30 秒）并保留常驻断线状态；认证失效停止交易通知并提示重新登录，不能无限刷新。
- 服务销毁取消请求、socket、定时器；本地失败不把凭据或消息正文写日志。

## Android 限制与权限

需要 INTERNET、POST_NOTIFICATIONS（Android 13+）、FOREGROUND_SERVICE 及与实际用途匹配的服务类型权限。不得通过降低 targetSdk 或虚报 dataSync 来绕过新系统限制。类型选择须按官方用途核验：长期实时信号监控不应冒充短时同步；若使用 specialUse，Manifest 写清用户主动开启的持续交易信号监控用途，并记录未来商店审核要求。

用户拒绝通知权限时清楚显示“后台通知未启用”，提供再次开启入口，不显示“已开启”。电池策略引导只在用户操作后打开系统设置，不自行改手机设置或承诺绝对保活。

退出到桌面、锁屏与系统强制停止不是一回事；用户强停、系统/OEM限制、网络失效都可能阻止送达。滑掉任务后的行为需在实机分别验证，不能仅凭 START_STICKY 宣称可靠。暂不增加开机自启或隐藏后台行为。

## 文件职责与测试

- Kotlin：SessionCoordinator/加密存储负责凭据和旋转；SignalNotificationPolicy 纯逻辑负责过滤/游标/去重；BackgroundMonitorService 负责网络/FGS/通知；MainActivity 仅 MethodChannel 和权限边界。
- Dart：background bridge 负责平台能力与状态；ApiClient Android 认证对接单一协调器；AoyingApp 登录和生命周期接线；设置页只加能力状态与显式开启/引导操作。
- JVM 单测先 RED：五类事件、非信号忽略、历史静默、重复/replay、登出 generation、旧刷新不可覆盖新登录、两个刷新者只旋转一次。
- Flutter 单测先 RED：平台桥失败/权限拒绝不伪装已启用、会话启停、Android/native 与非Android HTTP路径、注销重登和刷新竞争回归。
- 后端单测先 RED：协议2离线超过100条不漏页、实时/补洞并发不跳游标、空补洞也有完成水位；协议1旧行为兼容。只增强现有 WSS，不新增模拟信号生产端点。
- 回归：既有 Flutter 46 项与 analyze、后端165项及新增协议测试、Web现有32项不回归。
- 构建：修正 PowerShell 的 Gradle `-P` 参数引号，再构建连接公网 HTTPS 的内测 APK，检查最终 Manifest、版本和签名；旧 APK 不能冒充新包。
- 真实链路：用户根配置仍未读到 TG_API_ID/TG_API_HASH。补齐并安全迁移授权、核实指定群/话题后验证真实新消息；单独标注模拟通知测试，绝不把模拟记录插入真实仓位账本。

## 不在本次范围

厂商推送、强停后到达保证、自动交易、提现/转账、重建历史、重做 Web/安卓视觉、商店正式签名发布。
