import { StatusChip, type ChipState } from "@/components/ui/StatusChip";
import { PRODUCT_AVAILABILITY_LABELS } from "@/lib/product-suite/taxonomy";
import type { ProductAvailability } from "@/lib/product-suite/types";

const AVAILABILITY_CHIP: Record<ProductAvailability, ChipState> = {
  live: "success",
  beta: "accent",
  assisted: "warning",
  "coming-later": "dashed",
};

export function ProductStateBadge({ availability }: { availability: ProductAvailability }) {
  return (
    <StatusChip state={AVAILABILITY_CHIP[availability]} dot={availability !== "coming-later"}>
      {PRODUCT_AVAILABILITY_LABELS[availability]}
    </StatusChip>
  );
}
