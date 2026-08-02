export interface BrandBrainContent {
  business_name?: string;
  industry?: string;
  tone_of_voice?: string;
  target_audience?: string;
  products?: { name: string; description: string }[];
  pillars?: string[];
  rules?: string[];
  [key: string]: unknown;
}

export interface BrandBrainRow {
  tenant_id: string;
  current_version: number;
  updated_at: string;
}

export interface BrandBrainVersionRow {
  tenant_id: string;
  version: number;
  content: BrandBrainContent;
  created_by: string | null;
  created_at: string;
}
