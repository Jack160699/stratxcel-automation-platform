import { CUSTOMER_VALUE_PROPS } from "@/lib/product-suite/customer-language";
import { TrustChips } from "@/app/components/public/TrustChips";

export function CustomerValueProps({ className = "" }: { className?: string }) {
  return <TrustChips items={[...CUSTOMER_VALUE_PROPS]} className={className} />;
}
