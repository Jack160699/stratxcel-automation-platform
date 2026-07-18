"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function submitContact(
  _prev: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // Honeypot — bots fill every field; humans never see this one.
  if (String(formData.get("website") ?? "").trim() !== "") {
    return { status: "success", message: "Transmission received." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const company = String(formData.get("company") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const source = String(formData.get("source") ?? "website").slice(0, 60);

  if (name.length < 2 || name.length > 200) {
    return { status: "error", message: "Please tell us your name." };
  }
  if (!EMAIL_RE.test(email) || email.length > 320) {
    return { status: "error", message: "That email doesn't look right." };
  }
  if (message.length < 10 || message.length > 5000) {
    return {
      status: "error",
      message: "Tell us a little more — at least a sentence.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("stratxcel_contact_messages").insert({
    name,
    email,
    company: company || null,
    message,
    source,
  });

  if (error) {
    console.error("contact insert failed:", error.message);
    return {
      status: "error",
      message: "Something broke on our side — try again in a minute.",
    };
  }

  return { status: "success", message: "Transmission received. We'll reply within one business day." };
}
