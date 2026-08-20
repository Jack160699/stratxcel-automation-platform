$profileDir = "$env:USERPROFILE\.stratxcel-interactive-e2e"
if (Test-Path $profileDir) {
    Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
# Arguments formatted cleanly without nested escapes
$args = "--remote-debugging-port=9222 --user-data-dir=$profileDir --new-window --start-maximized --no-first-run --no-default-browser-check https://www.stratxcel.in/login"

Write-Host "Launching Chrome via Explorer COM Object..."
$shell = New-Object -ComObject Shell.Application
$shell.ShellExecute($chrome, $args, "", "open", 3)

Start-Sleep -Seconds 3

$conn = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
Write-Host "Port 9222 TCP Active: $([bool]$conn)"
if ($conn) {
    $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "Owning PID: $($p.Id)"
    Write-Host "MainWindowHandle: $($p.MainWindowHandle)"
    Write-Host "MainWindowTitle: '$($p.MainWindowTitle)'"
}
