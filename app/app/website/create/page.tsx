"use client";

import { useCurrentTenant } from "../../CurrentTenantContext";
import { SmartWebsiteCreator } from "@/components/site-builder/SmartWebsiteCreator";
import { useRouter } from "next/navigation";

export default function WebsiteCreatePage() {
  const { active } = useCurrentTenant();
  const tenantId = active?.tenantId;
  const router = useRouter();

  if (!tenantId) {
    return (
      <div className="p-8 text-center text-sx-text-muted">
        Please select or switch to an active tenant to create a website.
      </div>
    );
  }

  return (
    <div data-sx-ui="new-website-create" className="sx-customer-app py-6 px-2 md:px-6 max-w-5xl mx-auto">
      <SmartWebsiteCreator
        tenantId={tenantId}
        onClose={() => router.push("/app/website")}
        onPublish={() => router.push("/app/website")}
      />
    </div>
  );
}
