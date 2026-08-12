import { redirect } from "next/navigation";

export default function LegacySocialCopilotPage(): never {
  redirect("/admin/copilot?context=social");
}
