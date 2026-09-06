select id, provider, model, status, error_code, created_at, started_at, completed_at
from image_generation_jobs
where tenant_id = '466e6195-a9f6-4576-8271-29fdae61c18a'
order by created_at desc
limit 3;
