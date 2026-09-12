import { execFileSync } from "node:child_process";
import fs from "node:fs";

let commandToRun = process.argv[2] || "systemctl list-units --type=service | grep -E 'whatsapp|hermes|agent|nginx'";
if (process.argv[2] === "--node-file" && process.argv[3]) {
  const code = fs.readFileSync(process.argv[3], "utf8");
  const b64 = Buffer.from(code).toString("base64");
  commandToRun = `cd /opt/stratxcel-automation-platform && echo '${b64}' | base64 -d | /opt/node22/bin/node`;
} else if (process.argv[2] === "--file" && process.argv[3]) {
  commandToRun = fs.readFileSync(process.argv[3], "utf8");
}
const targetInstanceId = "i-0067f6c0dfd60cc46";

console.log(`Sending command to ${targetInstanceId}: ${commandToRun.slice(0, 100)}...`);

const awsExe = "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe";

const execOpts = {
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
};

const sendOutput = execFileSync(
  awsExe,
  [
    "ssm",
    "send-command",
    "--instance-ids",
    targetInstanceId,
    "--document-name",
    "AWS-RunShellScript",
    "--parameters",
    JSON.stringify({ commands: [commandToRun] }),
    "--region",
    "ap-south-1",
    "--output",
    "json",
  ],
  execOpts
);

const sendJson = JSON.parse(sendOutput);
const commandId = sendJson.Command.CommandId;
console.log(`Command sent. CommandId: ${commandId}. Waiting for completion...`);

let attempts = 0;
while (attempts < 20) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  attempts++;
  try {
    const invOut = execFileSync(
      awsExe,
      [
        "ssm",
        "get-command-invocation",
        "--command-id",
        commandId,
        "--instance-id",
        targetInstanceId,
        "--region",
        "ap-south-1",
        "--output",
        "json",
      ],
      execOpts
    );
    const invJson = JSON.parse(invOut);
    if (invJson.Status === "Success" || invJson.Status === "Failed" || invJson.Status === "Cancelled") {
      console.log(`Status: ${invJson.Status}`);
      console.log(`--- STDOUT ---`);
      console.log(invJson.StandardOutputContent);
      if (invJson.StandardErrorContent) {
        console.log(`--- STDERR ---`);
        console.log(invJson.StandardErrorContent);
      }
      process.exit(invJson.Status === "Success" ? 0 : 1);
    }
  } catch (err) {
    // wait and retry
  }
}
console.log("Timed out waiting for command invocation");
process.exit(1);
