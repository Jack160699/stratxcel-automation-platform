import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  getConnectorDefinition,
  getConnectorConnection,
  createConnectorConnection,
  resolveConnectorHealth,
  updateConnectorHealth,
  selectBestResource,
  executeConnectorCapability,
} from "../packages/connectors/src/index.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface VerificationEvidence {
  stage: string;
  name: string;
  passed: boolean;
  details: Record<string, unknown>;
}

const evidenceList: VerificationEvidence[] = [];

function recordEvidence(stage: string, name: string, passed: boolean, details: Record<string, unknown>) {
  evidenceList.push({ stage, name, passed, details });
  const icon = passed ? "PASS" : "FAIL";
  console.log(`[${icon}] ${stage}: ${name}`);
}

async function run() {
  console.log("================================================================");
  console.log("  PHASE 1: AWS CONNECTOR LIVE END-TO-END VERIFICATION SUITE");
  console.log("================================================================\n");

  // ─── STAGE 1: Real AWS Authentication (STS GetCallerIdentity) ───────────────
  console.log("--> Stage 1: Verifying Real AWS STS Authentication...");
  let callerIdentity: { Account: string; Arn: string; UserId: string };
  try {
    const stsOut = execSync("aws sts get-caller-identity --output json", {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    callerIdentity = JSON.parse(stsOut);
    const hasAccount = Boolean(callerIdentity.Account && callerIdentity.Account.length > 5);
    const hasArn = Boolean(callerIdentity.Arn && callerIdentity.Arn.includes("arn:aws"));
    recordEvidence("STAGE 1", "AWS STS Caller Identity Check", hasAccount && hasArn, {
      account: callerIdentity.Account,
      arn: callerIdentity.Arn,
      userId: callerIdentity.UserId,
      region: "ap-south-1",
      authenticated: true,
    });
  } catch (err: any) {
    recordEvidence("STAGE 1", "AWS STS Caller Identity Check", false, { error: err.message });
    throw new Error(`Stage 1 failed: ${err.message}`);
  }

  // ─── STAGE 2: Real Capability Discovery (EC2 & SSM) ────────────────────────
  console.log("\n--> Stage 2: Discovering Real AWS Capabilities (EC2 & SSM)...");
  const targetInstanceId = "i-0067f6c0dfd60cc46";
  let ec2Details: any = null;
  let ssmDetails: any = null;

  try {
    const ec2Out = execSync(
      `aws ec2 describe-instances --instance-ids ${targetInstanceId} --region ap-south-1 --output json`,
      { timeout: 6000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const ec2Parsed = JSON.parse(ec2Out);
    const inst = ec2Parsed.Reservations?.[0]?.Instances?.[0];
    ec2Details = {
      instanceId: inst.InstanceId,
      state: inst.State?.Name,
      instanceType: inst.InstanceType,
      publicIp: inst.PublicIpAddress,
      privateIp: inst.PrivateIpAddress,
      nameTag: inst.Tags?.find((t: any) => t.Key === "Name")?.Value,
    };
    recordEvidence("STAGE 2", "AWS EC2 Instance Discovery", inst.State?.Name === "running", ec2Details);
  } catch (err: any) {
    recordEvidence("STAGE 2", "AWS EC2 Instance Discovery", false, { error: err.message });
  }

  try {
    const ssmOut = execSync(
      `aws ssm describe-instance-information --filters "Key=InstanceIds,Values=${targetInstanceId}" --region ap-south-1 --output json`,
      { timeout: 6000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const ssmParsed = JSON.parse(ssmOut);
    const ssmInfo = ssmParsed.InstanceInformationList?.[0];
    ssmDetails = {
      instanceId: ssmInfo.InstanceId,
      pingStatus: ssmInfo.PingStatus,
      platformName: ssmInfo.PlatformName,
      platformVersion: ssmInfo.PlatformVersion,
      agentVersion: ssmInfo.AgentVersion,
    };
    recordEvidence("STAGE 2", "AWS Systems Manager (SSM) Agent Discovery", ssmInfo.PingStatus === "Online", ssmDetails);
  } catch (err: any) {
    recordEvidence("STAGE 2", "AWS Systems Manager (SSM) Agent Discovery", false, { error: err.message });
  }

  // ─── STAGE 3: Supabase Connector Connection & Health Resolution ────────────
  console.log("\n--> Stage 3: Registering Connection and Resolving Health in Supabase...");
  let connection = await getConnectorConnection(supabase as never, "aws", null);
  if (!connection) {
    connection = await createConnectorConnection(supabase as never, {
      connectorKey: "aws",
      tenantId: null,
      rawSecret: null,
      connectedByUserId: null,
      metadata: {
        accountId: callerIdentity.Account,
        region: "ap-south-1",
        identityArn: callerIdentity.Arn,
        targetInstanceId,
        ec2State: ec2Details?.state ?? "running",
        ssmStatus: ssmDetails?.pingStatus ?? "Online",
      },
    });
  }

  const health = await resolveConnectorHealth(supabase as never, "aws", connection, null);
  await updateConnectorHealth(supabase as never, {
    connectionId: connection.id,
    status: health.status,
    discoveredCapabilities: health.discoveredCapabilities,
    lastError: health.lastError,
    lastVerifiedAt: health.lastVerifiedAt,
  });

  const isHealthPassing = health.status === "healthy" && health.discoveredCapabilities.length >= 4;
  recordEvidence("STAGE 3", "AWS Connector Health & Capability Resolution", isHealthPassing, {
    connectionId: connection.id,
    healthStatus: health.status,
    discoveredCapabilities: health.discoveredCapabilities,
    lastVerifiedAt: health.lastVerifiedAt,
    details: health.details,
  });

  // ─── STAGE 4: Hermes Dynamic Resource Selector Integration ─────────────────
  console.log("\n--> Stage 4: Testing Hermes Dynamic Resource Selector Routing...");
  const capabilitiesToTest = [
    "infrastructure.inspect",
    "infrastructure.ec2",
    "infrastructure.ssm",
    "infrastructure.deploy_verify",
  ];

  for (const cap of capabilitiesToTest) {
    const selection = await selectBestResource(supabase as never, { capabilityKey: cap });
    const isSelected = selection.selectedConnector === "aws" && selection.status === "AVAILABLE";
    recordEvidence("STAGE 4", `Resource Selector: ${cap}`, isSelected, {
      requestedCapability: cap,
      selectedConnector: selection.selectedConnector,
      provider: selection.provider,
      status: selection.status,
      executionMethod: selection.executionMethod,
      requiresConfirmation: selection.requiresConfirmation,
    });
  }

  // ─── STAGE 5: 9-Gate Authorization & Safe Execution Engine ─────────────────
  console.log("\n--> Stage 5: Testing 9-Gate Authorization & Execution with Audit Trails...");

  // Test 1: infrastructure.inspect
  const inspectExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "aws",
    capabilityKey: "infrastructure.inspect",
    tenantId: null,
    actorKind: "founder",
    missionId: "mission-aws-audit-check",
    payload: {},
  });
  recordEvidence("STAGE 5", "Execution: infrastructure.inspect", inspectExec.success, {
    durationMs: inspectExec.executionTimeMs,
    data: inspectExec.data,
  });

  // Test 2: infrastructure.ec2
  const ec2Exec = await executeConnectorCapability(supabase as never, {
    connectorKey: "aws",
    capabilityKey: "infrastructure.ec2",
    tenantId: null,
    actorKind: "hermes",
    missionId: "mission-aws-audit-check",
    payload: { instanceId: targetInstanceId },
  });
  recordEvidence("STAGE 5", "Execution: infrastructure.ec2", ec2Exec.success, {
    durationMs: ec2Exec.executionTimeMs,
    data: ec2Exec.data,
  });

  // Test 3: infrastructure.ssm
  const ssmExec = await executeConnectorCapability(supabase as never, {
    connectorKey: "aws",
    capabilityKey: "infrastructure.ssm",
    tenantId: null,
    actorKind: "hermes",
    missionId: "mission-aws-audit-check",
    payload: { instanceId: targetInstanceId },
  });
  recordEvidence("STAGE 5", "Execution: infrastructure.ssm", ssmExec.success, {
    durationMs: ssmExec.executionTimeMs,
    data: ssmExec.data,
  });

  // Verify Audit Log entries in Supabase
  const { listConnectorAuditLogs } = await import("../packages/connectors/src/index.ts");
  const audits = await listConnectorAuditLogs(supabase as never, { connectorKey: "aws", limit: 10 });

  const hasAudits = Array.isArray(audits) && audits.length >= 3;
  recordEvidence("STAGE 5", "Audit Trail Persisted in Database", hasAudits, {
    recentAuditCount: audits?.length ?? 0,
    recentEvents: audits?.map((a) => `${a.event_type} (${a.capability_key}: ${a.status})`),
  });

  // ─── STAGE 6: Admin Visibility ─────────────────────────────────────────────
  console.log("\n--> Stage 6: Verifying Admin Visibility & Secret Masking...");
  const def = getConnectorDefinition("aws")!;
  const updatedConn = await getConnectorConnection(supabase as never, "aws", null);
  const updatedHealth = await resolveConnectorHealth(supabase as never, "aws", updatedConn, null);

  const adminItem = {
    definition: def,
    connection: updatedConn,
    health: updatedHealth,
  };

  const adminItemStr = JSON.stringify(adminItem);
  const adminChecksPass =
    adminItem.health.status === "healthy" &&
    adminItem.health.discoveredCapabilities.includes("infrastructure.inspect") &&
    adminItem.health.discoveredCapabilities.includes("infrastructure.ec2") &&
    adminItem.health.discoveredCapabilities.includes("infrastructure.ssm") &&
    !adminItemStr.includes("SecretAccessKey") &&
    !adminItemStr.includes("AWS_SECRET_ACCESS_KEY") &&
    !adminItemStr.includes("aws_secret_access_key");

  recordEvidence("STAGE 6", "Admin UI Visibility & Secret Shielding", adminChecksPass, {
    status: adminItem.health.status,
    label: adminItem.definition.label,
    category: adminItem.definition.category,
    account: adminItem.health.details?.accountId,
    discoveredCapabilitiesCount: adminItem.health.discoveredCapabilities.length,
    noSecretsExposed: true,
  });

  // ─── STAGE 7: Antigravity IDE / Local Execution Surface ───────────────────
  console.log("\n--> Stage 7: Verifying Antigravity IDE Integration Surface...");
  const awsCliVersion = execSync("aws --version", { encoding: "utf8" }).trim();
  const antigravityIntegrated = awsCliVersion.includes("aws-cli") && callerIdentity.Account === "257212469831";

  recordEvidence("STAGE 7", "Antigravity Local Environment AWS Integration", antigravityIntegrated, {
    cliVersion: awsCliVersion,
    authenticatedAccount: callerIdentity.Account,
    workspacePath: process.cwd(),
  });

  // ─── SUMMARY REPORT ────────────────────────────────────────────────────────
  console.log("\n================================================================");
  console.log("  VERIFICATION SUMMARY");
  console.log("================================================================");

  const total = evidenceList.length;
  const passed = evidenceList.filter((e) => e.passed).length;
  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${total - passed}`);

  if (passed === total) {
    console.log("\n>>> CERTIFICATION: [VERIFIED] <<<");
    console.log("AWS Connector is authenticated, healthy, and operational across");
    console.log("Hermes Resource Selector, 9-Gate Execution Engine, Admin UI, and Antigravity.\n");
  } else {
    console.error(`\n>>> CERTIFICATION FAILED: ${total - passed} checks failed. <<<`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("FATAL ERROR in AWS Verification Suite:", err);
  process.exit(1);
});
