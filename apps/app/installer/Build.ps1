param([switch]$PreviewOnly)
$ErrorActionPreference = 'Stop'
$appDirectory = Split-Path -Parent $PSScriptRoot
$repoDirectory = (Resolve-Path (Join-Path $appDirectory '../..')).Path
$version = (Get-Content (Join-Path $appDirectory '../app-frontend/package.json') -Raw | ConvertFrom-Json).version
$backend = Join-Path $repoDirectory "target/release/bundle/nsis/SimpleMC_${version}_x64-setup.exe"
if ($PreviewOnly) { $backend = Join-Path $repoDirectory 'LICENSE' }
elseif (!(Test-Path -LiteralPath $backend)) { throw 'Build the signed Tauri release installer first.' }
$output = Join-Path $repoDirectory "target/release/bundle/nsis/SimpleMC_${version}_x64-installer.exe"
if ($PreviewOnly) { $output = Join-Path $repoDirectory "target/release/bundle/nsis/SimpleMC_${version}_installer-preview.exe" }
New-Item -ItemType Directory -Force (Split-Path -Parent $output) | Out-Null
$framework = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$wpf = Join-Path $framework 'WPF'
$generatedDirectory = Join-Path $repoDirectory 'target/release/installer-source'
New-Item -ItemType Directory -Force $generatedDirectory | Out-Null
$installerSource = Join-Path $generatedDirectory 'Installer.cs'
$installerLayout = Join-Path $generatedDirectory 'Installer.xaml'
foreach ($file in @('Installer.cs', 'Installer.xaml')) {
	$content = (Get-Content (Join-Path $PSScriptRoot $file) -Raw -Encoding UTF8).Replace('__VERSION__', $version).Replace('__PREVIEW_ONLY__', $PreviewOnly.IsPresent.ToString().ToLowerInvariant())
	[IO.File]::WriteAllText((Join-Path $generatedDirectory $file), $content, [Text.UTF8Encoding]::new($false))
}
$installerIcon = Join-Path $appDirectory 'icons/icon.ico'
$installerLogo = Join-Path $appDirectory 'icons/128x128.png'
$installerBackground = (Resolve-Path (Join-Path $appDirectory '../app-frontend/src/assets/loading/minecraft-landscape.png')).Path
& (Join-Path $framework 'csc.exe') /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 `
	"/out:$output" "/win32icon:$installerIcon" `
	"/reference:$(Join-Path $wpf 'PresentationFramework.dll')" "/reference:$(Join-Path $wpf 'PresentationCore.dll')" "/reference:$(Join-Path $wpf 'WindowsBase.dll')" `
	/reference:System.Xaml.dll /reference:System.Windows.Forms.dll `
	"/resource:$backend,Backend" "/resource:$installerLayout,Layout" `
	"/resource:$installerBackground,Landscape" `
	"/resource:$(Join-Path $repoDirectory 'LICENSE'),License" "/resource:$(Join-Path $repoDirectory 'NOTICE.md'),Notice" `
	"/resource:$installerLogo,Logo" $installerSource
if ($LASTEXITCODE -ne 0) { throw 'Custom installer compilation failed.' }
Write-Output $output
