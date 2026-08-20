import { spawnSync } from "node:child_process";

console.log("Testing launch via Windows Explorer Shell...");
// Use explorer.exe to launch Chrome
const res = spawnSync("powershell", [
  "-Command",
  `
  # Launch Chrome directly via explorer.exe (routes to interactive desktop shell)
  Start-Process explorer.exe -ArgumentList 'chrome.exe', 'https://www.stratxcel.in/login'
  Start-Sleep -Seconds 2
  `
], { encoding: "utf8" });

console.log("Explorer launch output:", res.stdout);
console.log("Explorer launch stderr:", res.stderr);
