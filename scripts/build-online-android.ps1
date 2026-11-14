$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\android-env.ps1"
$root = Split-Path $PSScriptRoot -Parent
# Keep all Gradle paths on one ASCII drive, as required by this Windows toolchain.
if (Test-Path 'Q:\') {
    # subst's OEM output can corrupt the Chinese workspace name. Validate the
    # workspace content instead; never replace an existing drive mapping.
    foreach ($marker in @('README.md', '.git\HEAD', 'app\pubspec.yaml', 'app\lib\api.dart')) {
        if (!(Test-Path -LiteralPath "Q:\$marker") -or
            (Get-FileHash -LiteralPath "Q:\$marker").Hash -ne
            (Get-FileHash -LiteralPath "$root\$marker").Hash) {
            throw 'Q: workspace identity differs; refusing to replace it.'
        }
    }
} else {
    subst Q: $root
    if ($LASTEXITCODE -ne 0) { throw 'Could not map Q:' }
}
$env:GRADLE_USER_HOME = 'Q:\.tools\gradle-home'
$env:JAVA_TOOL_OPTIONS = '-Duser.home=Q:\.tools\home -Djava.io.tmpdir=Q:\.tools\tmp -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897 -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 -Dhttp.nonProxyHosts=localhost|127.*'
$defines = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('API_BASE_URL=https://64.176.50.42'))
& 'F:\aoying-android-tools\gradle-9.3.1\bin\gradle.bat' -p 'Q:\app\android' assembleDebug "-Pdart-defines=$defines" '-Ptarget-platform=android-arm64' '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' --no-daemon '-Dorg.gradle.jvmargs=-Xmx4G -Dfile.encoding=UTF-8'
exit $LASTEXITCODE
