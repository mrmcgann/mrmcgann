-- Optional: run the auction clock from Supabase instead of Vercel Cron
-- (Vercel's free plan only allows daily cron jobs).
-- Replace the URL and secret, then run this once in the Supabase SQL editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('tyrebiter-process', '* * * * *', $$
  select net.http_get(
    url := 'https://YOUR-SITE.vercel.app/api/cron/process?secret=YOUR_CRON_SECRET'
  );
$$);
