# 1. Clean previous process on 9222
try {
    $conns = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}

# 2. Reset Profile
$profileDir = "$env:USERPROFILE\.stratxcel-interactive-profile"
if (Test-Path $profileDir) {
    Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

# 3. Launch via Shell.Application (Explorer COM Server)
$chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$chromeArgs = "--remote-debugging-port=9222 --user-data-dir=`"$profileDir`" --new-window --start-maximized --no-first-run --no-default-browser-check https://www.stratxcel.in/login"

Write-Host "Invoking Shell.Application COM ShellExecute..."
$shell = New-Object -ComObject Shell.Application
$shell.ShellExecute($chromeExe, $chromeArgs, "", "open", 3)

Write-Host "Dispatched to interactive desktop via explorer.exe"
