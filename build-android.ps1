$env:ANDROID_HOME = "D:\android-sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:NDK_HOME = "D:\android-sdk\ndk\30.0.14904198"
$env:PATH = "$env:JAVA_HOME\bin;D:\android-sdk\platform-tools;$env:PATH"

Write-Host "`n=== Building TinyDo Android APK ===" -ForegroundColor Cyan

npx tauri android build --target aarch64
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed" -ForegroundColor Red; exit 1 }

$zipalign = "D:\android-sdk\build-tools\36.1.0\zipalign.exe"
$apksigner = "D:\android-sdk\build-tools\36.1.0\apksigner.bat"
$unsigned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$aligned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-aligned.apk"
$final = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-release.apk"
$keystore = "$env:USERPROFILE\.android\debug.keystore"

Write-Host "`n=== Signing APK ===" -ForegroundColor Cyan

& $zipalign -f 4 $unsigned $aligned
& $apksigner sign --ks $keystore --ks-pass "pass:android" --ks-key-alias androiddebugkey --key-pass "pass:android" --out $final $aligned
Remove-Item $aligned -ErrorAction SilentlyContinue
& $apksigner verify $final

Write-Host "`n=== Done ===" -ForegroundColor Green
Write-Host "APK: $final"
Write-Host "Size: $([math]::Round((Get-Item $final).Length / 1MB, 1)) MB"
