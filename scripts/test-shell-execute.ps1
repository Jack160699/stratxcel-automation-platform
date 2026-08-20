$profileDir = "$env:TEMP\stratxcel-e2e-shellexec-browser"
if (Test-Path $profileDir) {
    Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$args = "--remote-debugging-port=9222 --user-data-dir=`"$profileDir`" --new-window --start-maximized https://www.stratxcel.in/login"

Write-Host "Launching Chrome via ShellExecute (UseShellExecute = true)..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $chrome
$psi.Arguments = $args
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Maximized

$proc = [System.Diagnostics.Process]::Start($psi)
Write-Host "Spawned Process ID: $($proc.Id)"

Start-Sleep -Seconds 2
$tcp = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue
Write-Host "TCP Port 9222 Active: $([bool]$tcp)"
