-- Enable pg_cron and pg_net extensions
-- NOTE: pg_cron may need to be enabled via Supabase Dashboard (Database > Extensions)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Process pending orders every 5 minutes
SELECT cron.schedule(
  'process-pending-orders',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-pending-orders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);

-- Check margin calls every 5 minutes
SELECT cron.schedule(
  'check-margin-calls',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/check-margin-calls',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);

-- Snapshot portfolios daily at 18:00 CET (17:00 UTC in winter, 16:00 UTC in summer)
SELECT cron.schedule(
  'snapshot-portfolios',
  '0 17 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/snapshot-portfolios',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
