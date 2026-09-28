# Stress test results (28 September 2026)

Test machine: 2 vCPU, 7 GB RAM, Postgres 16, **shared with the load generator** (so real Supabase compute does better). Raw numbers are in `results/*.json` and `results/final.log`.

## The data: three years after launch
1,000,000 accounts (600,000 fully verified bidders), 60,000 vehicles (3,000 live at once), 1.1M bids, 1.1M maximum bids, 3M watchlist entries, 250,000 saved searches, 3M notifications, 45,000 invoices. Database size: 3 GB.

## 1. Every query the site makes, at full size
All 42 queries were timed as the right role, with the security rules on.

| Query (worst before the fixes) | Before | After |
|---|---|---|
| Admin: find a member | 747 ms | 1.0 ms |
| Member: notifications | 224 ms | 0.4 ms |
| Admin: newest members | 160 ms | 2.4 ms |
| Listing cover photos (60 cards) | 108 ms | 1.0 ms |
| Lot page: photos | 75 ms | 1.1 ms |
| Admin editor (security rules) | 74 ms | 1.4 ms |
| Past results | 69 ms | 1.8 ms |
| Lot page: flaws | 49 ms | 0.6 ms |
| Admin dashboard (11 counts) | 27 ms | 4.0 ms |
| Watchlist reminders (clock) | 26 ms | 0.8 ms |
| Member: my maximum bids | 25 ms | 0.3 ms |

**After the fixes, the slowest of the 42 queries is 9.7 ms (median) and 10.8 ms (p95).**

The fixes were:
- 45 indexes
- trigram search indexes
- a cover photo stored on each vehicle
- security rules evaluated once per query instead of once per row

## 2. Sale day: 10,000 members browsing and bidding at full speed
This test was deliberately worst-case: every page view went to the database, with no caching.

- **1,355 requests/second for 60 seconds, including 171 bids/second.**
- **Zero faults**: no deadlocks, timeouts or errors.
- p95: 150–190 ms per request. That's mostly the test machine's CPU queue, since the load generator shares the same 2 cores.

## 3. The last-second snipe
2,000 bidders hit one car in its final 30 seconds, making 2,983 bid attempts in 3.5 seconds.

- **Zero faults.** Every bid was either accepted or correctly refused as too low.
- The auction correctly ended **exactly 10 minutes after the last bid**.

## 4. Correctness after the storm
**2,068 auctions with bids were checked: 0 problems.** In every one:
- the leader holds the highest maximum
- the bid count matches the bid rows
- the visible bid equals the top bid, is never above the leader's maximum, and never below the runner-up's maximum

## 5. Closing time
- **2,000 auctions closing in the same minute: all closed in 1.4 seconds.** No duplicate invoices, and every invoice was claimed for charging exactly once.
- Status alerts cover referred, offers, sold, didn't win and the seller: about 32 ms per vehicle.
- One-hour watchlist reminders: 21,000 queued in 6 seconds.
- Saved-search alerts: 50 new vehicles × 250,000 saved searches, producing **228,789 matches in 40 seconds**.
  - This was 202 seconds before the set-based rewrite.
  - It runs every 15 minutes.

## 6. The message queue
- **22,800 messages/second through the database**, with 8 parallel senders and zero duplicates.
- The real limits are the providers:
  - Resend: about 800 emails/second in batches
  - Twilio: about 10 SMS/second per sender
- Payment and outbid messages go first. "Ending soon" messages that can't go out in time are skipped.
- Found and fixed during the test: with 2M messages queued, the expiry sweep was scanning the whole queue. An index made the drain rate go from 800/s to 22,800/s.

## 7. Sign-up rush
**5,000 new accounts in 1.2 seconds (4,055/second).**

## 8. The website itself
Tested with 200 simultaneous connections for 20 seconds against a mock database, on one small server.

| Page | Before (every visit rendered) | After (edge-cached) | Database queries per 1,000 views |
|---|---|---|---|
| Home | 11/s, p50 6.9 s | **262/s**, p50 0.4 s | 2,617 → **1** |
| Vehicle pages | 20/s, p50 4.3 s | **300/s**, p50 0.6 s | 502 → **25** |
| Auctions | 20/s | **599/s** (static page) + 474/s search API | 377 → **0 / 21** |
| Live price (polled by open lot pages) | – | 397/s at the origin | cached 1 s at the edge |

On Vercel these pages and the search API are served from the CDN, so one server's throughput isn't the ceiling.

Found and fixed during the test:
- Every page used to read the visitor's session, which made every page uncacheable.
- The lot page used to reload on every bid for every viewer.

Now the header, hearts, bid panel and your own position load in the browser from small private APIs. Visitors who aren't signed in make no personal requests at all.

## What this means for 10,000 people live
- **Database load**:
  - bids (one call each)
  - signed-in members' own data (one call per page view)
  - cache refills: a handful per second, regardless of visitor numbers
  - the clock
  
  The sale-day test showed a 2-core database doing ~1,350 requests/second with no faults. Supabase **Large or XL** gives comfortable headroom.
- **Live prices**: Supabase Realtime Broadcast, not Postgres Changes.
  - One message per bid is fanned out to every viewer. Supabase benchmarks this at 32,000+ users.
  - Needs Pro with the spend cap off for 10,000 connections.
  - If Realtime is unavailable, pages fall back to polling the edge-cached price every 2–5 seconds.
- **Web**: Vercel Pro auto-scales functions to 30,000 concurrent. The busy pages are edge-cached.

## Not testable here (verify on staging)
- Supabase Realtime connection limits, Auth rate limits, Vercel CDN behaviour, and Stripe/Twilio/Resend throughput with real accounts. The README lists the settings to change.
- A final end-to-end load test against a staging deploy with real services, before launch.
