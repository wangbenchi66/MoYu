<#
清理仓库对象上的显式完整性标签（Mandatory Label）。

背景：受限/沙箱会话写进仓库的文件会带 Low/Medium 完整性标签，构建产物
（尤其是 release 下的安装器）继承标签后，双击运行时进程会被降到该完整性
级别 —— 表现为「安装器不是管理员、要提权」「NSIS 卸载器步骤 exit 2」
「应用写不进自己的 AppData」。

本脚本用 SACL 方式移除 Mandatory Label ACE，恢复「无标签」状态：
无标签的可执行文件会继承启动者的令牌（资源管理器 → 管理员），行为与
普通克隆下来的仓库一致。它不是把标签设成 Medium —— 那会让安装器以
非管理员身份运行，反而触发提权对话框。

用法：
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\clear-integrity-labels.ps1
  powershell ... -File scripts\clear-integrity-labels.ps1 -Path "E:\path\to\dir"

默认清理：MoYu（仅目录本身）、MoYu\release 与 MoYu\dist（递归）。
需要 SeSecurityPrivilege，请在管理员终端中运行。
#>
param(
    [string]$Path = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

# 只清理目录本身：新文件是否继承标签取决于父目录。
$dirsOnly = @(
    (Join-Path $repoRoot 'MoYu')
)

# 递归清理：构建产物与打包输入，体积可控。
$recursiveDirs = @(
    (Join-Path $repoRoot 'MoYu\release'),
    (Join-Path $repoRoot 'MoYu\dist')
)
if ($Path) { $recursiveDirs += $Path }

$csharp = @'
using System;
using System.Runtime.InteropServices;
public static class MoYuLabelCleaner {
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern uint SetNamedSecurityInfoW(string pObjectName, int ObjectType, uint SecurityInfo,
        IntPtr psidOwner, IntPtr psidGroup, IntPtr pDacl, IntPtr pSacl);
    [DllImport("advapi32.dll", SetLastError=true)]
    static extern bool InitializeAcl(IntPtr pAcl, int nAclLength, int dwAclRevision);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr h, int acc, out IntPtr t);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool LookupPrivilegeValue(string sys, string name, out long luid);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool AdjustTokenPrivileges(IntPtr t, bool dis, ref TP1 n, int len, IntPtr prev, IntPtr ret);
    [StructLayout(LayoutKind.Sequential, Pack=4)] struct TP1 { public int Count; public long Luid; public int Attr; }
    static IntPtr _acl = IntPtr.Zero;
    static MoYuLabelCleaner() {
        IntPtr tok;
        OpenProcessToken(GetCurrentProcess(), 0x28, out tok);
        long luid;
        LookupPrivilegeValue(null, "SeSecurityPrivilege", out luid);
        TP1 tp = new TP1(); tp.Count = 1; tp.Luid = luid; tp.Attr = 2;
        AdjustTokenPrivileges(tok, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
        _acl = Marshal.AllocHGlobal(256);
        InitializeAcl(_acl, 256, 2);
    }
    public static uint Remove(string path) {
        return SetNamedSecurityInfoW(path, 1, 0x10, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, _acl);
    }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$total = 0
$failed = 0
$skipped = 0

function Clear-OnePath {
    param([string]$Target, [bool]$Recurse)
    if (-not (Test-Path -LiteralPath $Target)) { return $false }
    $resolved = (Resolve-Path -LiteralPath $Target).Path
    if ($Recurse) {
        $objects = @(Get-ChildItem -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue)
        foreach ($obj in $objects) {
            if ([MoYuLabelCleaner]::Remove($obj.FullName) -eq 0) { $script:total++ } else { $script:failed++ }
        }
    }
    if ([MoYuLabelCleaner]::Remove($resolved) -eq 0) { $script:total++ } else { $script:failed++ }
    return $true
}

foreach ($item in $dirsOnly) {
    if (-not (Clear-OnePath -Target $item -Recurse $false)) { $skipped++ }
}
foreach ($item in $recursiveDirs) {
    if (-not (Clear-OnePath -Target $item -Recurse $true)) { $skipped++ }
}

Write-Output ("[integrity] normalized {0} object(s), {1} failure(s), {2} path(s) skipped" -f $total, $failed, $skipped)
exit 0
