select task_class, count(*) as calls, round(sum(estimated_cost_usd)::numeric, 6) as total_usd
from ai_execution_usage
where tenant_id = '466e6195-a9f6-4576-8271-29fdae61c18a'
  and created_at >= date_trunc('month', now())
group by task_class
order by task_class;

select metric, current_usage, limit_amount, is_paused
from usage_entitlements
where tenant_id = '466e6195-a9f6-4576-8271-29fdae61c18a'
  and metric in ('social_autopilot_manual_monthly', 'automated_content_monthly', 'content_generation_monthly', 'image_generation_attempts_monthly')
order by metric;
