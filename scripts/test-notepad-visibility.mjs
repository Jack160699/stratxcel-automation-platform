import { spawnSync } from "node:child_process";

console.log("Launching notepad.exe via Start-Process in Session 1...");

const res = spawnSync("powershell", [
  "-Command",
  `
  $p = Start-Process notepad.exe -PassThru
  Start-Sleep -Milliseconds 1500
  $proc = Get-Process -Id $p.Id
  [PSCustomObject]@{
    PID = $proc.Id
    SessionId = $proc.SessionId
    MainWindowTitle = $proc.MainWindowTitle
    MainWindowHandle = $proc.MainWindowHandle
  } | Format-List
  `
], { encoding: "utf8" });

console.log("Launcher Output:\n", res.stdout);
if (res.stderr) console.error("Launcher Stderr:\n", res.stderr);
