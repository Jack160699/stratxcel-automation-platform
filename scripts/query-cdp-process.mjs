import { execSync } from "node:child_process";

const ps = `
$conn = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $conn) {
    $p = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "Owning PID: $($p.Id)"
    Write-Host "Session ID: $($p.SessionId)"
    Write-Host "Main Window Title: $($p.MainWindowTitle)"
    Write-Host "Main Window Handle: $($p.MainWindowHandle)"
} else {
    Write-Host "No process listening on 9222"
}
`;

try {
  const out = execSync(`powershell -Command "${ps.replace(/\r?\n/g, '; ')}"`, { encoding: "utf8" });
  console.log(out);
} catch (e) {
  console.error(e.message);
}
