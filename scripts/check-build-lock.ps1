# 打包前置检查：是否有进程从构建目录启动
#
# 为什么单独放一个 .ps1 而不是写在 .bat 里：
# 批处理里用 -Command "..." 传 PowerShell 代码时，cmd 会先处理 $ 和引号，
# 导致 $p 变成空值、检测永远走 else 分支（静默失效）。
# 实测过：明明有占用进程，脚本仍报告 "free"。
# 所以把它独立成文件，由 build.bat 调用。

$ErrorActionPreference = 'SilentlyContinue'

$running = Get-Process -Name MoYu |
    Where-Object { $_.Path -and $_.Path -like '*TransBrowser*' }

if ($running) {
    Write-Host ''
    Write-Host '      [BLOCKED] These processes are running from the build folder:' -ForegroundColor Red
    foreach ($proc in $running) {
        Write-Host ('        PID ' + $proc.Id + '  ' + $proc.Path)
    }
    Write-Host ''
    Write-Host '      electron-builder cannot overwrite release\win-unpacked while'
    Write-Host '      these are alive. Close them and run this script again, or kill'
    Write-Host '      them with:  taskkill /F /IM MoYu.exe'
    Write-Host ''
    exit 1
}

# 顺带检查卡住的 7za / app-builder（它们会占住 win-unpacked）
$stuck = Get-Process -Name 7za, app-builder |
    Where-Object { $_.Path -and $_.Path -like '*TransBrowser*' }

if ($stuck) {
    Write-Host ''
    Write-Host '      [WARN] A build helper is still running from a previous build:' -ForegroundColor Yellow
    foreach ($proc in $stuck) {
        Write-Host ('        PID ' + $proc.Id + '  ' + $proc.ProcessName + '  ' + $proc.Path)
    }
    Write-Host ''
    Write-Host '      It may hold files in release\win-unpacked. Kill it with:'
    Write-Host ('        taskkill /F /PID ' + $stuck[0].Id)
    Write-Host ''
    exit 1
}

Write-Host '      OK - build folder is free.'
exit 0
