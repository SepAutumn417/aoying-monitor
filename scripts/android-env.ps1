# Dot-source before Flutter/Gradle commands: . ./scripts/android-env.ps1
# ASCII junction avoids shader compiler failures on the Chinese workspace path.
$toolRoot = 'F:\aoying_ascii\.tools'
$env:JAVA_HOME = "$toolRoot\java\jdk-17.0.21+9"
$env:ANDROID_HOME = "$toolRoot\android-sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = "$toolRoot\android-user"
$env:ANDROID_EMULATOR_HOME = "$toolRoot\android-user"
$env:GRADLE_USER_HOME = "$toolRoot\gradle-home"
$env:PUB_CACHE = "$toolRoot\pub-cache"
$env:LOCALAPPDATA = "$toolRoot\localappdata"
$env:APPDATA = "$toolRoot\appdata"
$env:TEMP = "$toolRoot\tmp"
$env:TMP = $env:TEMP
$env:JAVA_TOOL_OPTIONS = "-Duser.home=$toolRoot\home -Djava.io.tmpdir=$toolRoot\tmp"
foreach ($dir in @($env:ANDROID_USER_HOME, $env:GRADLE_USER_HOME, $env:TEMP)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$toolRoot\flutter\bin;$env:PATH"
