param(
    [switch]$SkipShortcut,
    [switch]$SkipTasks,
    [switch]$PatchNow
)

$ErrorActionPreference = 'Stop'
$BaseDir = $PSScriptRoot
$PatchScript = Join-Path $BaseDir 'patch-antigravity.mjs'
$AutoPatchScript = Join-Path $BaseDir 'auto-patch.ps1'
$PatchNowCmd = Join-Path $BaseDir 'patch-now.cmd'
$PatchNowLog = Join-Path $BaseDir 'patch-now.log'
$IconPath = Join-Path $BaseDir 'vi-antigravity.ico'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required on PATH before installing antigravity-vi.'
}
if (-not (Test-Path -LiteralPath $PatchScript)) {
    throw "Missing patch-antigravity.mjs in $BaseDir"
}

if (-not $SkipTasks) {
    $currentUser = "$env:USERDOMAIN\$env:USERNAME"
    $principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

    $autoAction = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AutoPatchScript`""
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
    $repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
    $autoSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
        -Hidden
    Register-ScheduledTask `
        -TaskName 'AntigravityViAutoPatch' `
        -Principal $principal `
        -Action $autoAction `
        -Trigger @($logonTrigger, $repeatTrigger) `
        -Settings $autoSettings `
        -Description 'Automatically re-injects Vietnamese UI and Quota panel into Antigravity after updates' `
        -Force | Out-Null

    $nowCmd = "Start-Sleep -Seconds 5; & cmd.exe /c \`"$PatchNowCmd\`" > \`"$PatchNowLog\`" 2>&1"
    $nowAction = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$nowCmd`""
    $nowSettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances Parallel
    Register-ScheduledTask `
        -TaskName 'AntigravityViPatchNow' `
        -Principal $principal `
        -Action $nowAction `
        -Settings $nowSettings `
        -Force | Out-Null

    Write-Host '[agy-vi] Registered scheduled tasks: AntigravityViAutoPatch, AntigravityViPatchNow'
}

if (-not $SkipShortcut) {
    $cs = @'
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class AgyViShortcut {
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    private class ShellLink {}

    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    private interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cchMaxPath, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public static void Create(string lnkPath, string targetPath, string workingDir, string iconPath, int iconIndex, string description) {
        var link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);
        link.SetWorkingDirectory(workingDir);
        if (!string.IsNullOrEmpty(iconPath)) {
            link.SetIconLocation(iconPath, iconIndex);
        }
        link.SetDescription(description);
        link.SetShowCmd(1);
        var file = (IPersistFile)link;
        file.Save(lnkPath, false);
        SHChangeNotify(0x08000000, 0x0000, IntPtr.Zero, IntPtr.Zero);
    }
}
'@
    if (-not ('AgyViShortcut' -as [type])) {
        Add-Type -TypeDefinition $cs
    }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnkName = "Vi$([char]0x1EC7)t h$([char]0x00F3)a Antigravity.lnk"
    $lnkPath = Join-Path $desktop $lnkName
    $desc = "Vi$([char]0x1EC7)t h$([char]0x00F3)a giao di$([char]0x1EC7)n v$([char]0x00E0) hi$([char]0x1EC3)n th$([char]0x1ECB) Quota tr$([char]0x00EA)n Antigravity"
    $iconToUse = if (Test-Path -LiteralPath $IconPath) { $IconPath } else { "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe" }
    [AgyViShortcut]::Create($lnkPath, $PatchNowCmd, $BaseDir, $iconToUse, 0, $desc)
    Write-Host "[agy-vi] Created Desktop shortcut: $lnkPath"
}

if ($PatchNow) {
    & cmd.exe /c "`"$PatchNowCmd`""
    exit $LASTEXITCODE
}

& node $PatchScript --check *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host '[agy-vi] Antigravity is already patched.'
    exit 0
}

$running = Get-Process -Name 'Antigravity' -ErrorAction SilentlyContinue
if ($running) {
    Write-Host '[agy-vi] Antigravity.exe is running. Close it or run patch-now.cmd (or Desktop shortcut) to apply patch.'
} else {
    & node $PatchScript --if-needed
}
