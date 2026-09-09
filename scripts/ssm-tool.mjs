import { execFileSync } from "node:child_process";
import fs from "node:fs";

const commandToRun = process.argv[2] || "systemctl list-units --type=service | grep -E 'whatsapp|hermes|agent|nginx'";
const targetInstanceId = "i-0067f6c0dfd60cc46";

console.log(`Sending command to ${targetInstanceId}: ${commandToRun}`);

const awsExe = "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe";

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
  { encoding: "utf8" }
);

const sendJson = JSON.parse(sendOutput);
const commandId = sendJson.Command.CommandId;
console.log(`Command sent. CommandId: ${commandId}. Waiting for completion...`);

let attempts = 0;
while (attempts < 15) {
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
      { encoding: "utf8" }
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
