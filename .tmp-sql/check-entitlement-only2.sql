select metric, current_usage, limit_amount, is_paused, updated_at
from usage_entitlements
where tenant_id = '466e6195-a9f6-4576-8271-29fdae61c18a'
  and metric = 'social_autopilot_manual_monthly';
