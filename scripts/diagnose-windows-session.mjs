import { execSync } from "node:child_process";

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" });
  } catch (err) {
    return `Error: ${err.message}\nOutput: ${err.stdout || ""}`;
  }
}

console.log("=== 1. USER & ENVIRONMENT ===");
console.log("Username:", process.env.USERNAME);
console.log("Userdomain:", process.env.USERDOMAIN);
console.log("Process PID:", process.pid);

console.log("\n=== 2. QUERY USER ===");
console.log(run("query user"));

console.log("\n=== 3. QWINSTA (Session list) ===");
console.log(run("qwinsta"));

console.log("\n=== 4. EXPLORER PROCESS (User Desktop Session) ===");
console.log(run("powershell -Command \"Get-Process explorer | Select-Object Id, ProcessName, SessionId, MainWindowTitle, StartTime | Format-Table -AutoSize\""));

console.log("\n=== 5. CHROME PROCESSES & SESSIONS ===");
console.log(run("powershell -Command \"Get-Process chrome -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, SessionId, MainWindowTitle | Format-Table -AutoSize\""));

console.log("\n=== 6. CURRENT AGENT PROCESS SESSION ===");
console.log(run("powershell -Command \"(Get-Process -Id $PID).SessionId\""));
