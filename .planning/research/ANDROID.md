# Android 14／Redmi K50 接收与提醒可行性研究

日期：2026-10-30。范围：自有HTTPS/WSS、无小米推送资格、个人自用客户端。设备由用户截图确认：Redmi K50，Android 14，OS 2.0.10.0.ULNCNXM。

## 结论

**有条件可行，须先通过真机可行性关卡，不能承诺后台必达或必然叫醒。** 推荐先实现用户主动启动的、可见的监听会话：常驻通知显示连接状态、最近收信时间和停止监听按钮；服务端保留有序事件，手机事务落库后回执，断线按游标补收。界面或服务器代码不能解决手机深度休眠造成的网络限制。

不要先建完整交易信息App再验证保活。最先验证的是K50在无VPN、锁屏和深度待机时能否持续收信，以及收到后声音是否能按用户授权播放。Gotify收到过消息但无声音，仅是实验事实，不可据此推断自研必然解决。

## 官方约束与设计影响

| 约束 | 本项目应对 |
|---|---|
| target Android 14时必须声明适用前台服务类型及相应权限，否则启动可异常 | 不为绕限制伪装服务用途；类型选择是Phase 1技术关卡 |
| remoteMessaging定义是跨设备转移文本、维持用户消息任务连续性 | 不能仅因我们“接收消息”就默认适用，交易监控不自动符合 |
| specialUse覆盖其他有效前台用例，要求声明具体subtype说明；Google Play上架会审核 | 可作为个人自用原型的候选，但必须真实描述“用户主动开启的个人事件监控”，不是通用免限制权限；未来分发另行审核 |
| 后台启动前台服务受限制 | 用户在可见Activity明确点击启动；不承诺进程被杀后任意自启 |
| Doze限制网络；电池优化豁免是部分豁免，其他限制仍存在 | 检查/引导用户设置并明确显示状态；不要把常驻通知当作网络可达保证。官方说明被部分豁免的App可在Doze使用网络和部分唤醒锁 |
| Android 13+普通通知需运行时权限 | 首次连接前说明并请求通知权限；被拒绝时显示明显状态，不能悄悄声称“提醒就绪” |
| 通知声音由通知channel与用户设置决定 | 连接状态与事件提醒使用不同channel；检查importance/声音/振动和勿扰状态。创建channel后不能靠每条消息参数随意覆盖用户设置 |
| Android 14全屏intent默认许可面向通话/闹钟 | 不把全屏弹窗当基础依赖；不伪装电话或闹钟。先提供正常通知和可访问的停止按钮 |
| 前台服务也能被用户停止 | 不绕过用户停止；强行停止、关机、断网期间无法保障即时到达，重新打开后补收 |

持续铃声是单独的播放生命周期：必须有停止入口、最大持续时长与音轨并发规则，且正确释放播放器与振动。不能声称忽略静音/勿扰总能响；音频用途、权限和K50行为须实测。不要仅为保活启动mediaPlayback或phoneCall服务。

## 推荐最小实现

1. Kotlin原生App，一个连接/权限诊断页和测试事件页；暂不做复杂仓位UI。
2. 用户可见操作启动监听，真实服务类型经过独立审查；单WSS连接、心跳、网络恢复重连。
3. Room中唯一event_id和每设备sequence，事务保存后回received；停止声音、已知晓分别处理。
4. 回执与重放不等于严格恰好一次响铃。保存与音频启动之间崩溃应显示待处理状态，不隐瞒缺口。
5. 默认仅合成事件，五分钟有效期，过期补收不触发新的实时操作提示；TLS正常验证，设备密钥不进URL。
6. 先在可见页面测试音频，再测试锁屏与后台启动播放，失败时定位权限/channel/音量/后台条件，不靠重复通知掩盖。

## 最小验证与退出条件

- 明确记录实际targetSdk、系统版本、安装来源、签名证书、通知/省电/自启动设置。
- Wi-Fi与移动网络均关闭VPN，测试亮屏、锁屏至少两小时、整夜待机、切网、清最近任务、用户停止服务、系统强行停止和手机重启；这些场景分别统计，不混算。
- 用测试环境ADB触发Doze与真实待机交叉验证，不能仅靠亮屏时秒收验收。
- 至少24小时100条编号合成事件，分别记录服务端生成、WSS写出、设备落库和用户确认时间；时钟差单独记录。
- 在线延迟P95≤5秒和到达率目标需用户确认；网络限制/离线期间不承诺。恢复后数量与顺序核对，无漏项不可仅看最后游标。
- 逐条验证铃声、振动、停止、并发、超时、重复事件、过期补收；通知channel权限拒绝要可见。
- 若合法适用的服务类型或K50深度待机接收不能通过，不进入Telegram和多平台建设，先评审技术路线。不得以降低targetSdk或绕过用户强停来“通过”。

## 对路线图的影响

第一阶段必须把“服务类型适用性＋Doze下网络＋后台声音”作为前置实验，而不是只验HTTPS/WSS。设备认证/持久化和补收可并行设计；业务平台采集必须在手机关卡通过后实施。上架、其他品牌、Android升级是新的兼容性范围，不以K50单机通过外推。

## 来源与置信边界

以下均为Android官方主源。前台类型与Doze页面已直接读取核对；其他条目通过官方搜索结果与链接定位，实施阶段仍须按实际targetSdk复核。文档规则置信较高，K50厂商行为尚无真机证据，置信未定。Web浏览工具部分调用网络失败，改用HTTPS读取官方页面；未引用论坛或第三方保活教程。

- [前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types)：remoteMessaging、specialUse定义与权限。
- [Android 14前台服务要求](https://developer.android.com/about/versions/14/changes/fgs-types-required)：类型和权限必须匹配。
- [Doze及App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)：网络限制、部分电池优化豁免、测试方法。
- [后台启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)：不可假设随意后台拉起。
- [通知运行时权限](https://developer.android.com/develop/ui/views/notifications/notification-permission)。
- [通知channel](https://developer.android.com/develop/ui/views/notifications/channels)。
- [Android 14行为变化](https://developer.android.com/about/versions/14/behavior-changes-14)：全屏提醒与后台Activity限制。
- [AOSP全屏intent限制](https://source.android.com/docs/core/permissions/fsi-limits)：通话/闹钟用途边界。

未解决：K50厂商省电与后台播放实际表现、特定分发渠道的服务用途审核、持续铃声API/前台类型最终组合。这些必须在Phase 1研究与真机实验中关闭。
