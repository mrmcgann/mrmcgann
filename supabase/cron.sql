-- Optional: run the auction clock from Supabase instead of Vercel Cron
-- (Vercel's free plan only allows daily cron jobs).
-- Replace the URL and secret (the same CRON_SECRET as on Vercel: at least 32 random characters), then run this once
-- in the Supabase SQL editor. The secret goes in a header, so it never appears in a web address or a log.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('tyrebiter-process', '* * * * *', $$
  select net.http_get(
    url := 'https://YOUR-SITE.vercel.app/api/cron/process',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
  );
$$);
