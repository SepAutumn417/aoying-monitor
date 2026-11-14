# 2026-11-10 现有版本上线记录

## 已部署并通过接口冒烟

- Web / API：https://64.176.50.42（0.4.0；本次没有把设计原型替换进生产代码）。
- 登录使用工作区原有 ADMIN_USERNAME / ADMIN_PASSWORD；不在文档或日志记录密码。
- nginx 同域提供 Web、`/api/`、`/ws`；API 仅监听 127.0.0.1:8000。
- systemd：`aoying-api.service`，非 root 用户 aoying，单 worker；开机启动、失败重启。
- 当前发布目录 `/opt/aoying-monitor/releases/20261110-1535-wsv2`；前一版本 `/opt/aoying-monitor/releases/20261110-0940` 保留，可回退。
- 持久化库 `/var/lib/aoying/aoying.db`；配置 `/etc/aoying/production.env`（root:aoying，0640）。
- 从本机真实 SQLite 账本使用在线 backup API 制作副本，校验完整性；不修改源库，不重建历史，不复制原有刷新会话。使用随机新的 JWT_SECRET；复制配置不含模型、交易所或 Telegram API 凭据。
- 保持 shadow、COPY_PAUSED=true，不启用实盘交易。
- 原 HTTP ACME 配置、IP 证书和续期 timer 保留。原 HTTPS 配置备份在服务器 `/root/aoying-deploy/nginx-https.before-20261110`。

线上 HTTPS 冒烟实际验证：healthz 数据库正常；匿名仓位接口 401；原账号登录成功；真实仓位接口返回 17 条（全部 closed，当前 open=0），信号接口 100 条，最近一条为 2026-11-06T12:50:49Z。WSS 一次性票据可连接，hello 和 ping/pong 成功；重复票据拒绝；注销后刷新令牌拒绝。未插入模拟交易信号。该烟测从服务器经公网 HTTPS 地址执行，不等于浏览器 UI 或手机听音验收。

## 安卓修复与构建

- 补 main Manifest INTERNET 权限。
- 登录壳统一管理 WS / 提醒；匿名、登出及销毁时停止并清理旧事件/游标。
- 修复 logout 缺少认证头、离线清 token、迟到 WS ticket 重新连接、慢 logout 清掉新登录 token。
- 新增 5 项 logout 回归均经历 RED → GREEN；完整 Flutter 46 项测试通过。格式化后的一项花括号 lint 提示另已修正，最终 analyze 结果另行记录。
- 后端 165、Web 32 项测试及 Web 生产构建通过。后端测试有既存连接回收警告，不是零警告结果。
- 安卓版本统一 0.4.0+2，连接 `https://64.176.50.42`。使用既有 debug 签名制作内测更新包，不是商店正式发布包；没有把密码/API密钥编译进 APK。
- 构建命令见 `scripts/build-online-android.ps1`；APK 构建/签名/下载校验结果待补。
- 未操作用户手机前台、未证明手机实际声音或后台送达。旧版 USB localhost APK 不能访问本次线上服务，必须更新本次构建包。

## 14:35 中断恢复复核

- 重新核验服务器：aoying-api / nginx 均为 active；公网 HTTPS healthz 返回 0.4.0、database=ok、latest_event_id=219；current 仍为初次发布目录。此次复核未修改服务器配置或账本。
- 本机配置再次仅输出存在性：TG_API_ID=false、TG_API_HASH=false、session 文件存在、自动启动=false。仍不能把历史账本当作实时采集已运行；没有输出凭据值。
- 用户已批准 Android 原生 specialUse 常驻前台服务方案和实施设计；实现工作恢复中，尚无已完成后台功能或新 APK。分工为后端 v2 分页补洞、原生唯一认证与通知服务、Dart 桥接；通过真实失败回归后再实施。
- 基线最终 `dart analyze lib test` 已通过（No issues）；新后台功能仍须单独测试、构建和经授权实机验收。
- 恢复后后端本地新增可靠 v2 补洞及真实并发发布乱序回归：完整 184 项通过，Ruff 全 backend 通过；WS 按已提交账本升序分页发送，hub 仅作唤醒，overflow 强制 1013 重连。此排序边界限当前单 worker SQLite，不宣称支持 PostgreSQL 并发提交顺序。尚未把该更新部署上线。
- Android 原生纯逻辑首轮 8 项 JUnit 均已实际 RED → GREEN（Gradle 构建通过）；只覆盖事件 reducer 和认证 owner 核心，不代表 FGS、系统通知、权限或实机验收已完成。后续水位握手竞态、权限及服务适配仍在实现。

## 15:43 后端增量发布与线上 v2 实证

- 代码专用更新包 51 个文件，183876 字节，SHA-256 `7d0ca108dad35b94da17f3a55b788eda6136f2997b1a6b8b5ad31e6849d9f560`；不含数据库、环境配置、凭据或 Telegram session。脚本 `deploy/apply-code-update.sh` 先校验归档白名单与哈希、在线备份 SQLite，切换代码链接后重启并检查本机/公网 health；失败回滚前版代码。
- 上线前完整数据库备份 `/root/aoying-deploy/before-20261110-1535-wsv2.db`，完整性检查通过。没有更换生产数据库、配置、nginx 或 ACME。
- 当前 `/opt/aoying-monitor/releases/20261110-1535-wsv2`；healthz 仍为 0.4.0，数据库正常。线上登录/匿名拒绝/账本/WSS ping-pong/票据重用拒绝/注销刷新拒绝全部通过。
- 公网 WSS v2 从游标 0 实际收到 **3 页共 219 个有序唯一事件**，固定水位 219，最终 replay_complete=219；未向账本插入模拟信号。
- 真实业务数据仍为 open=0、closed=17、signals=100，最近信号 Nov 6；collector 仍 stopped。这次补洞实证不等于实时消息来源已接通，也不等于手机通知已验收。
- Dart 新后台桥接及普通退出偏好隔离完成：相关 19 项、完整 **60 项测试通过**；`dart analyze --fatal-infos lib test` 为 **No issues found**。普通 logout 仅调用 auth.logout，由原生内部停服清会话但保留用户停用偏好；显式 monitor.stop 才持久化用户停用。原生边界 15 项中 14 项真实失败已记录，正在实现，不宣称后台服务已完成。

## 2026-11-11 继续验收

- 从持久化 JUnit XML 核实：NativeBoundaryTest 15 项、NativeContractTest 8 项，共 23 项，失败/错误均为 0（执行时间 2026-11-10T08:25Z）。上轮 Gradle 已退出 0；这不是 APK 已生成或实机已验收的证据。
- 原生后台服务、Keystore 会话、系统通知和 Dart 桥接已有实现；当前正在构建线上 APK。权限对话框、实际系统通知、锁屏送达及设备生命周期仍待实机验收。
- 再次核实生产服务 active、current 为 20261110-1535-wsv2、HTTPS healthz 正常，事件水位仍 219。
- 本机再次仅检查配置存在性：TG_API_ID=false、TG_API_HASH=false、session 文件存在、自动启动=false。尚不能验收真实新消息整链。
- 用户已授权覆盖安装、打开项目 App、申请通知权限及桌面/锁屏测试；不清除应用数据，不执行交易，测试通知必须标注测试。

## 2026-11-11 APK 与实机阶段验收通过

- `scripts/build-online-android.ps1` 实际完成 `assembleDebug`，Gradle `BUILD SUCCESSFUL in 8m 17s`。产物 `app/build/app/outputs/apk/debug/app-debug.apk`，83,821,777 字节；metadata applicationId=com.aoying.aoying_monitor、versionName=0.4.0、versionCode=2。
- SHA-256：`2abb0a78718a8c191682e837380bb0984bbaa68909d8131468481203c002b351`。服务器下载副本校验一致，HTTPS HEAD 200、长度一致：`https://64.176.50.42/downloads/aoying-monitor-0.4.0-2-debug.apk`。内测 debug 签名，不是商店发布包。
- 已经授权覆盖安装到 Redmi 22041211AC / Android 14，adb install Success；设备 dumpsys 确认 0.4.0/code2。没有卸载或清除应用数据，没有执行交易。
- 小米系统起初拒绝 ADB input（INJECT_EVENTS）；用户调整后重试成功。配置凭据仅由本机受保护环境读入并输入已识别登录框，未记录值。登录后 UI 实际读取线上真实账本：open=0、closed=17，来源时间 Nov 6。
- 在设置点击“开启后台提醒”后，UI 显示通知已授权、系统允许、常驻服务开启、连接已连接；电池策略仍受限制。dumpsys 证实 BackgroundMonitorService isForeground=true、foregroundId=7001、specialUse 类型，常驻通知 channel=aoying.monitor.status.v1。
- 通过既有 `/api/events/test?action=...` 发送 3 条明确 test=true 的信号，仅追加测试事件，不修改 signals/positions 账本：前台 open #222 无系统信号通知（抑制符合预期）；Home 后 reduce #223、锁屏/Dozing 后 close #224 均出现对应 event-id 稳定标签的系统通知，importance=4、channel=aoying.monitor.signals.v1、sound=default、vibrate=default。已证明 OS 接收并发布通知，不宣称人耳已确认响铃，也不外推长时间深度 Doze/OEM 保活。
- 测后线上再次冒烟通过：0 open / 17 closed / 100 signals 未变；WSS 3 页 224 有序唯一事件、水位 224；票据重用拒绝、注销刷新拒绝。collector 仍 stopped。应用范围 E 级日志快照无记录；不将其当作所有时段无崩溃的证明。
- 手机最后保持锁屏与用户已开启的监控服务；未调整系统电池策略、未绕过锁屏认证。真实 TG 新消息、断网长时重连、停止/注销生命周期及声音听感仍需后续验收。

## 2026-11-11 Telegram 实连与线上账本更新

- 用户补齐本地 TG_API_ID/TG_API_HASH 后，新进程验证字段存在、hash 格式正确；未输出值。只通过 SSH/SFTP 迁移 Telegram 两个字段和一致的 session SQLite backup，没有迁移本机其他凭据，也未覆盖服务器 ADMIN/JWT/database 配置。
- 服务器真实 connect + is_user_authorized=true；get_me 的内部 ID 与原数据库账号一致。没有调用 get_dialogs/iter_dialogs，没有发送登录验证码或在群发帖。
- 指定目标 -1002568478710 实际为 forum；API 实返四话题 1 聊天群、748 禁言群、926111 熬鹰交易信号推送、1006930 消息通知，与既有白名单一致。后三个 closed=true；General open。Telegram reported_count=3 但实际列表为 4，因此按实际列表记录。
- session 安装至 `/var/lib/aoying/telegram.session`（aoying:aoying，0600）；生产配置仍 root:aoying 0640。TG_AUTO_START=true 已配置并通过实际 service restart 验证自动恢复 running，原有四话题保持启用，仍是单个授权群。
- 补拉按原有每话题/每轮最多 4000 条的扫描边界逐轮追赶，期间如实报告未补完。12:38 复查四话题 last_error 均为空、last_synced_at 均已更新；消息总数 21,202。采集器启动后累计处理 208 次变更、last_message_at=2026-11-11T04:38:44Z，证明真实在线接收，不将“连接成功”冒充入库成功。
- 先在隔离数据库试算，用户明确批准后，短暂停止采集以避免并行重算；生产备份 `/root/aoying-deploy/before-ledger-rebuild-20261111-035900.db` 完整性通过，然后调用既有 `/api/signals/rebuild` 并恢复采集。未删除原始消息、未下单，重建统计 messages=8500、signals=117、positions=22、events=113、orphans=4（与原来相同数量）。历史信号推送新增 0。
- 最新线上 `/api/copy/status`：open=1、closed=21、signals=117、position events=113，最近信号 2026-11-10T15:02:56Z。Web/Android 共用该真实来源账本；已打开旧页面需刷新/重新进入以重新读取。初次部署的 open=0/closed=17/100 signals 只是上方历史阶段记录。
- 临时本地/远程 credential transfer 文件已删除，原始本地 .env/session 和受限生产配置/session 保留。生产升级与重建均有备份。

## 2026-11-11 自然真实信号捕获与整链实证通过

- **自然捕获真实交易信号（无需合成数据）**：
  - 2026-11-11 15:28:08 UTC+8（07:28:08Z），采集器捕获话题 926111（熬鹰交易信号推送）消息 #1778303，解析为 **Signal #118**（ETHUSDT 调杠杆 5x -> 6x），并写入 **Event #1606**（`kind=signal.leverage`，test=false）。
  - 2026-11-11 15:28:11 UTC+8（07:28:11Z），捕获消息 #1778305，解析为 **Signal #119**（ZECUSDT 新开仓 空 6x，入场价 990.00 USDT，数量 50.50 ZEC），写入 **Event #1609**（`kind=signal.open`，test=false）。
  - 2026-11-11 15:29:16 UTC+8（07:29:16Z），捕获消息 #1778319，解析为 **Signal #120**（ZECUSDT 加仓 空 6x，持仓量变为 101.09 ZEC），写入 **Event #1626**（`kind=signal.add`，test=false）。
- **最新生产账本自动同步**：
  - `/api/copy/status` 实时状态：`positions_open: 2`（ETHUSDT short、ZECUSDT short）、`positions_closed: 21`、`realized_closed: 875207.28`、`signals: 120`、`events: 116`、`last_signal_at: 2026-11-11T07:29:16Z`。
  - WSS v2 实收最新事件水位达 2060+，所有连接中的 Web 和 Android 客户端均已按序接收上述真实交易事件。
- **全链路目标达成**：
  - 真实 Telegram 消息实时采集 → 交易员信号自动解析 → 仓位账本自动维护（开仓/调杠杆/加仓）→ 事件日志追加及 WebSocket v2 广播全链路已完成自然真实验证。

## 当前验收边界 / 运维参考

1. **真实整链已完全闭环**：真实消息采集、信号入库、开仓加仓推导、WSS 推送及安卓后台通知服务基础已完全就绪并经历了真实信号验证。
2. **数据源定义**：数据来自监控交易员 Telegram 频道推送的信号账本，非交易所实盘 API 资产对账。
3. **客户端运行**：新版 Android App（0.4.0+2）需保持前台常驻服务运行以确保系统通知即时下发；若遇系统极端省电查杀需手动给予定位或白名单保护。

## 运维与回退

- `systemctl status aoying-api nginx` / `journalctl -u aoying-api`；不要把配置或令牌粘到日志里。
- `/healthz` 检查数据库及版本；日志禁用 nginx 访问日志避免 WS URL 票据落盘。
- 代码回退：将 `/opt/aoying-monitor/current` 链接切回保留的 `/opt/aoying-monitor/releases/20261110-0940`，重启 aoying-api 并检查 healthz；保留现有数据库、配置和 nginx。不要把代码回退误做成恢复首次上线前的 nginx 404 占位配置。
- 再次发布不要覆盖生产数据库/配置；服务变更需重启 aoying-api，nginx 配置需先检查再 reload。安装脚本改为按 healthz 重试等待就绪（首轮固定 2 秒过短已发现并修正）。

## 2026-11-13 设计中心与 Web 前端线上发布

- **发布版本**：`20261113-1138-webv2`
- **更新归档**：SHA-256 `994f1a45fda5356b2091eff50b8b9dd880c040a1c1723867137f11a9813c413a`，文件数 62，202,567 字节（纯代码更新，不包含数据库、环境配置或凭据）。
- **部署前在线备份**：`/root/aoying-deploy/before-20261113-1138-webv2.db`，已通过 SQLite 完整性检查。
- **发布路径**：`/opt/aoying-monitor/releases/20261113-1138-webv2`，软链接切换原子生效。
- **上线内容**：
  1. 消息中心设计原型及样式打包发布，公网可直接访问 `/workspace.html`（已包含 3 处文字吸顶防重叠修复）及 `/home.html`。
  2. Web 单页应用全局样式接入设计中心 Token 变量体系，增加深浅色主题切换机制。
  3. 监控总览页升级为双栏布局，当前持仓支持「卡片 / 表格」双视图，右侧联动 Telegram 话题列表。
  4. 侧边栏接入“熬”品牌标、深浅色模式切换开关及设计原型直达入口。
- **线上冒烟验证**：
  - `https://64.176.50.42/healthz` 返回 200，版本 `0.4.0`，数据库正常，事件水位正常推进。
  - `https://64.176.50.42/` 返回 200。
  - `https://64.176.50.42/workspace.html` 返回 200。
  - aoying-api 与 nginx 运行状态 active，现有 WebSocket 客户端重连成功。

