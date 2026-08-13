export const SOURCE_CLASSES = ["VERIFIED_PUBLIC", "CUSTOMER_PROVIDED", "AI_INFERRED", "UNKNOWN"] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];

export const SOURCE_CLASS_RANK: Record<SourceClass, number> = {
  CUSTOMER_PROVIDED: 1,
  VERIFIED_PUBLIC: 2,
  AI_INFERRED: 3,
  UNKNOWN: 4,
};

export interface ProvenanceField<T> {
  value: T;
  sourceClass: SourceClass;
  sourceUrl?: string;
  verifiedByCustomer?: boolean;
}

export function pickHighestTruth<T>(
  current: ProvenanceField<T> | undefined,
  incoming: ProvenanceField<T>,
): ProvenanceField<T> {
  if (!current) return incoming;
  if (current.verifiedByCustomer) return current;
  if (incoming.verifiedByCustomer) return incoming;
  return SOURCE_CLASS_RANK[incoming.sourceClass] < SOURCE_CLASS_RANK[current.sourceClass]
    ? incoming
    : current;
}

export function field<T>(
  value: T,
  sourceClass: SourceClass,
  sourceUrl?: string,
  verifiedByCustomer = false,
): ProvenanceField<T> {
  return { value, sourceClass, sourceUrl, verifiedByCustomer };
}

export function isUnknown(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
