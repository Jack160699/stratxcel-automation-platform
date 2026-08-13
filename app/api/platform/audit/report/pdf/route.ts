import { ownedCompletedAudit } from "../_owned";
import { normalizeAuditDeliveryReport } from "@/lib/audit/customer-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, width = 90): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 36);
}

function paginate(lines: Array<{ size: number; text: string }>): Array<Array<{ size: number; text: string }>> {
  const pages: Array<Array<{ size: number; text: string }>> = [[]];
  let used = 0;
  for (const line of lines) {
    const cost = line.text ? 16 : 10;
    if (used + cost > 680) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1]!.push(line);
    used += cost;
  }
  return pages;
}

function buildPdf(title: string, sections: Array<{ heading: string; lines: string[] }>): Buffer {
  const contentLines: Array<{ size: number; text: string }> = [
    { size: 18, text: "Stratxcel Business Growth Audit" },
    { size: 13, text: title.slice(0, 90) },
    { size: 10, text: "" },
  ];
  for (const section of sections) {
    if (!section.lines.length) continue;
    contentLines.push({ size: 12, text: section.heading });
    for (const line of section.lines) contentLines.push({ size: 10, text: line.slice(0, 110) });
    contentLines.push({ size: 10, text: "" });
  }
  const pages = paginate(contentLines);
  const contentBuffers = pages.map((page) => {
    let y = 740;
    return page
      .map((line) => {
        const command = line.text
          ? `BT /F1 ${line.size} Tf 48 ${y} Td (${pdfEscape(line.text)}) Tj ET`
          : "";
        y -= line.text ? 16 : 10;
        return command;
      })
      .filter(Boolean)
      .join("\n");
  });
  const fontObjectNumber = 3 + pages.length * 2;
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const kids: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageNum = 3 + i * 2;
    const contentNum = 4 + i * 2;
    kids.push(`${pageNum} 0 R`);
    rest.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`);
    rest.push(`<< /Length ${Buffer.byteLength(contentBuffers[i] ?? "")} >>\nstream\n${contentBuffers[i]}\nendstream`);
  }
  objects.push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`);
  objects.push(...rest);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const startxref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return Buffer.from(body);
}

export async function GET() {
  const ctx = await ownedCompletedAudit();
  if ("error" in ctx) return ctx.error;
  const report = normalizeAuditDeliveryReport(ctx.order.report_data);
  if (!report) return Response.json({ error: "Report is not ready" }, { status: 409 });
  const pdf = buildPdf(String(ctx.order.business_name ?? "Audit"), [
    { heading: "Executive summary", lines: wrap(report.executiveSummary) },
    { heading: "What is working", lines: report.strengths.slice(0, 8) },
    { heading: "Priority risks", lines: report.priorityRisks.slice(0, 8) },
    { heading: "Owner actions", lines: (report.ownerActions ?? report.actionPlan).slice(0, 8) },
    { heading: "30-day plan", lines: report.plan?.days30.slice(0, 8) ?? [] },
    { heading: "Sources", lines: [`${report.sources?.length ?? 0} verified public sources. Customer-reported facts are not treated as externally verified.`] },
  ]);
  await ctx.service.from("audit_delivery_events").insert({
    audit_order_id: ctx.order.id,
    tenant_id: ctx.tenantId,
    channel: "pdf",
    status: "sent",
  });
  return new Response(Uint8Array.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="stratxcel-audit.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
