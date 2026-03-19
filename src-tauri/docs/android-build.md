# Android 构建指南

## 环境准备

需要以下环境变量（PowerShell）：

```powershell
$env:ANDROID_HOME = "D:\android-sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:NDK_HOME = "D:\android-sdk\ndk\30.0.14904198"
$env:PATH = "$env:JAVA_HOME\bin;D:\android-sdk\platform-tools;$env:PATH"
```

## 构建 + 签名（一键）

在项目根目录运行：

```powershell
# 1. 编译 release APK（仅 arm64）
npx tauri android build --target aarch64

# 2. 对齐 + 签名
$zipalign = "D:\android-sdk\build-tools\36.1.0\zipalign.exe"
$apksigner = "D:\android-sdk\build-tools\36.1.0\apksigner.bat"
$unsigned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$aligned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-aligned.apk"
$final = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-release.apk"
$keystore = "$env:USERPROFILE\.android\debug.keystore"

& $zipalign -f 4 $unsigned $aligned
& $apksigner sign --ks $keystore --ks-pass "pass:android" --ks-key-alias androiddebugkey --key-pass "pass:android" --out $final $aligned
Remove-Item $aligned -ErrorAction SilentlyContinue

# 3. 验证
& $apksigner verify --verbose $final
```

产出文件：`src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-release.apk`

## 完整一键脚本

将以下内容保存为 `build-android.ps1` 在项目根目录运行：

```powershell
$env:ANDROID_HOME = "D:\android-sdk"
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
$env:NDK_HOME = "D:\android-sdk\ndk\30.0.14904198"
$env:PATH = "$env:JAVA_HOME\bin;D:\android-sdk\platform-tools;$env:PATH"

npx tauri android build --target aarch64
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

$zipalign = "D:\android-sdk\build-tools\36.1.0\zipalign.exe"
$apksigner = "D:\android-sdk\build-tools\36.1.0\apksigner.bat"
$unsigned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
$aligned = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-aligned.apk"
$final = "src-tauri\gen\android\app\build\outputs\apk\universal\release\tinydo-release.apk"
$keystore = "$env:USERPROFILE\.android\debug.keystore"

& $zipalign -f 4 $unsigned $aligned
& $apksigner sign --ks $keystore --ks-pass "pass:android" --ks-key-alias androiddebugkey --key-pass "pass:android" --out $final $aligned
Remove-Item $aligned -ErrorAction SilentlyContinue
& $apksigner verify $final

Write-Output "`nAPK ready: $final"
Write-Output "Size: $([math]::Round((Get-Item $final).Length / 1MB, 1)) MB"
```

## 注意事项

- 当前使用 debug keystore 签名，仅用于测试。正式发布需要生成专用 keystore。
- `--target aarch64` 只编译 arm64 架构，覆盖绝大多数 Android 手机。加 `--target x86_64` 可支持模拟器。
- 首次构建需要下载 Gradle 和依赖，耗时较长。后续构建会快很多。
- Windows 需要开启 Developer Mode（设置 > 系统 > 开发者选项）。
