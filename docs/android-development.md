# Windows Android 开发环境与 USB 验证记录

工具均放在仓库忽略目录 `.tools/`，不替换系统 Java 或其他项目 SDK。`F:\aoying_ascii` 是 `F:\AOYING交易监控` 的 ASCII 目录联接，避免 Flutter shader 编译器处理中文路径失败。

## 日常静态检查与测试

```powershell
# 仅当前进程放行脚本，不修改用户/机器执行策略。
Set-ExecutionPolicy -Scope Process Bypass -Force
. ./scripts/android-env.ps1
cd F:\aoying_ascii\app
flutter doctor -v
dart analyze lib test
flutter test
```

[环境脚本](../scripts/android-env.ps1) 设置 Java、SDK、Android/Gradle/Pub 缓存和临时目录，并只修改当前终端 PATH。新终端需要重新加载。系统默认 Temp 曾导致 ADB 日志和依赖安装权限错误。

## 已安装工具

- Temurin OpenJDK 17.0.21+9。
- Android command-line tools 12.0。
- Android platform 36、build-tools 36.0.0、platform-tools 37.0.1（ADB 1.0.41）。
- NDK 28.2.13676358、CMake 3.22.1。
- 项目 Gradle 9.3.1；分发 ZIP 的 SHA-256 与官方校验值一致。

Android/NDK 版本取自当前 Flutter SDK，不通过随意降级依赖绕过错误。`flutter doctor` 的 Android toolchain 与 licenses 检查通过；未安装 Android Studio、模拟器镜像、Chrome 或 Windows 桌面 C++ 套件，这些不是当前 Android 命令行构建的必要条件。

## 本机打包的特殊路径与代理

普通 `flutter build apk --debug` 在本机先后遇到 Kotlin DSL unresolved reference、跨盘符增量缓存错误、Google Maven / Flutter artifact TLS 下载中断。最终成功构建使用下面的组合，而不是宣称普通 wrapper 路径已经修好：

1. 把本工作区映射到空闲盘符 `Q:`，Gradle 项目、缓存、Java home/tmp 使用该映射。
2. Gradle runtime 的 bin/lib 使用物理 ASCII 路径 `F:\aoying-android-tools\gradle-9.3.1`。
3. Kotlin 关闭增量缓存，编译器在当前进程执行。
4. Java 显式使用本机已启用的代理 `127.0.0.1:7897`；不关闭 TLS 校验。其他机器须使用自己的代理配置，不能照搬端口。

已成功的命令形态（先加载环境脚本；**先运行 `subst` 确认 Q 未被其他项目占用**）：

```powershell
subst Q: 'F:\AOYING交易监控'
$env:GRADLE_USER_HOME='Q:\.tools\gradle-home'
$env:JAVA_TOOL_OPTIONS='-Duser.home=Q:\.tools\home -Djava.io.tmpdir=Q:\.tools\tmp -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897 -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttp.nonProxyHosts=localhost|127.*'
$defines=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('API_BASE_URL=http://127.0.0.1:8000'))
& 'F:\aoying-android-tools\gradle-9.3.1\bin\gradle.bat' -p 'Q:\app\android' assembleDebug "-Pdart-defines=$defines" -Ptarget-platform=android-arm64 -Pkotlin.incremental=false -Pkotlin.compiler.execution.strategy=in-process --no-daemon '-Dorg.gradle.jvmargs=-Xmx4G -Dfile.encoding=UTF-8'
```

2026-11-09 的该次构建记录为 `BUILD SUCCESSFUL in 29m 39s`。这是上一版 0.4.0 功能代码的验证包，不代表后续 I4d 源码已经重新打包。

## 手机与验证边界

- USB Redmi `22041211AC` 已授权，Android 14 / SDK 34、1440×3200、arm64-v8a。
- 上述 Debug APK 经 `adb_install` 返回 `Success`，项目包名 `com.aoying.aoying_monitor`。
- 包元数据显示 versionName `1.0.0` / versionCode `1`，而应用上报常量为 `0.4.0`；这是已发现的发布版本号漂移，正式发布前需统一。
- `adb reverse tcp:8000 tcp:8000` 已成功；该 USB 测试包的地址是 `http://127.0.0.1:8000`。默认 `10.0.2.2:8000` 仅用于模拟器。USB 映射不是公网部署。
- 原隔离联调后端使用独立测试库和随机凭据，未连接 Telegram 或交易所；联调结束后已停止。
- 用户选择“稍后再测，先保留安装结果”：**未验证手机前台页面、五种提示音和后台送达**，后续开发不得擅自切换手机前台。
- I4d 仅完成源码与自动化测试，当前手机安装的仍是此前的包；新包更新安装另行安排。
- Debug APK 不用于商店发布；当前 release 配置仍使用 debug 签名，正式发布必须单独配置签名。

## 合理使用 DSH 插件

Logcat 已成功读取该手机的设备信息；UI 自动化及截图工具部分调用曾出现 idle/返回值校验错误。安装成功不等于 APP 功能通过。当前终端环境变量也不会自动传给已运行的 DSH。

设计工作台已打开本地 Web 开发服务器；未登录页检查不能代替业务页验收。I4d 的 Midscene 配置接口超时，没有完成 Midscene 端到端测试；该增量改用 Playwright + Edge 验证真实登录与业务页。详见 [I4d 验收记录](increments/I4d.md)。
