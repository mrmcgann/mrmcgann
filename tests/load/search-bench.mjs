// Search speed (run after build.mjs; everything is rolled back). Usage: node tests/load/search-bench.mjs
// Search speed at marketplace scale: 1M accounts, 60k lots, 20k live across all 10 categories, 250k saved searches.
import pg from 'pg';
const c = new pg.Client({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', database: process.env.SCALE_DB || 'tyrebiter_scale' });
await c.connect();
await c.query('begin');
const cats = ['cars','utes','vans','trucks','trailers','buses','motorbikes','caravans','boats','machinery'];
const vt = { cars:'car', utes:'ute', vans:'van', trucks:'truck', trailers:'trailer', buses:'bus', motorbikes:'bike', caravans:'caravan', boats:'boat', machinery:'tractor' };
const kinds = { cars:['sedan','hatch','suv','wagon'], utes:['dual-cab','single-cab','cab-chassis'], vans:['van','crew-van'], trucks:['tipper','tray','pantech','prime-mover'], trailers:['box','car','plant'], buses:['minibus','bus'], motorbikes:['road','dirt','scooter','adventure'], caravans:['caravan','pop-top','motorhome'], boats:['tinny','runabout','jet-ski'], machinery:['tractor','excavator','forklift'] };
const makes = { cars:['Toyota','Mazda','Hyundai','Kia','Holden','Ford'], utes:['Toyota','Ford','Isuzu','Mitsubishi','Nissan'], vans:['Toyota','Ford','Hyundai'], trucks:['Isuzu','Hino','Kenworth','Volvo'], trailers:['Brian James','Maxitrans'], buses:['Toyota','Mitsubishi Fuso'], motorbikes:['Yamaha','Honda','Kawasaki','KTM','Harley-Davidson'], caravans:['Jayco','Avan','Windsor'], boats:['Quintrex','Stacer','Sea-Doo'], machinery:['Kubota','John Deere','Caterpillar'] };
const models = { Toyota:['HiLux','Corolla','LandCruiser','HiAce','Coaster'], Mazda:['CX-5','Mazda3'], Hyundai:['i30','iLoad'], Kia:['Cerato'], Holden:['Commodore'], Ford:['Ranger','Falcon','Transit'], Isuzu:['D-Max','NPR'], Mitsubishi:['Triton'], Nissan:['Navara'], Hino:['300 Series'], Kenworth:['T909'], Volvo:['FH'], 'Brian James':['Cyclone'], Maxitrans:['Freighter'], 'Mitsubishi Fuso':['Rosa'], Yamaha:['MT-07','WR250F'], Honda:['CRF250L'], Kawasaki:['Ninja 400'], KTM:['390 Duke'], 'Harley-Davidson':['Fat Boy'], Jayco:['Starcraft'], Avan:['Aliner'], Windsor:['Rapid'], Quintrex:['Hornet'], Stacer:['Seasprite'], 'Sea-Doo':['Spark'], Kubota:['M7040'], 'John Deere':['5075E'], Caterpillar:['308'] };
const t0 = Date.now();
// turn 20,000 past lots into live ones, spread across every category
await c.query(`create temp table pick as select id, row_number() over (order by id) rn from lots where status in ('sold','passed') order by id limit 20000`);
const { rows } = await c.query('select id, rn from pick');
const vals = rows.map((r) => {
  const cat = cats[r.rn % 10]; const mk = makes[cat][r.rn % makes[cat].length]; const md = models[mk][r.rn % models[mk].length];
  return `(${r.id},'${cat}','${vt[cat]}','${kinds[cat][r.rn % kinds[cat].length]}','${mk.replace(/'/g,"''")}','${md}')`;
});
for (let i = 0; i < vals.length; i += 2000) {
  await c.query(`update lots l set status='live', category=v.cat, vehicle_type=v.vt, kind=v.kind, make=v.mk, model=v.md, title=v.mk || ' ' || v.md || ' ' || l.id,
    winner_id=null, sold_price=null, sold_via=null, current_bid=1000 + (l.id * 37) % 60000, published_at=now() - interval '2 days' - (l.id % 90) * interval '1 minute',
    ends_at=now() + interval '10 minutes' + (l.id * 97 % (7*24*60)) * interval '1 minute', state=(array['QLD','NSW','VIC','WA','SA','TAS','NT','ACT'])[1 + l.id % 8],
    fuel=(array['Petrol','Diesel','Hybrid','Electric'])[1 + l.id % 4], transmission=(array['Automatic','Manual','CVT'])[1 + l.id % 3], drive=(array['2WD','4WD','AWD'])[1 + l.id % 3],
    hours=case when v.cat in ('boats','machinery') then (l.id * 13) % 6000 end, engine_cc=case when v.cat='motorbikes' then 125 + (l.id % 10) * 100 end,
    lams=case when v.cat='motorbikes' then l.id % 3 = 0 end, berths=case when v.cat='caravans' then 2 + l.id % 5 end, length_m=case when v.cat in ('caravans','boats','trailers') then 3 + (l.id % 60) / 10.0 end,
    licence_class=case when v.cat in ('trucks','buses') then (array['C','LR','MR','HR','HC'])[1 + l.id % 5] end
    from (values ${vals.slice(i, i + 2000).join(',')}) v(id, cat, vt, kind, mk, md) where l.id = v.id`);
}
await c.query('analyze lots');
const live = (await c.query(`select count(*) n from lots where status='live'`)).rows[0].n;
console.log(`setup: ${live} live lots in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

async function time(label, sql, params = [], runs = 15) {
  await c.query(`set local role anon`);
  await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  const ts = [];
  let n;
  for (let i = 0; i < runs; i++) { const t = process.hrtime.bigint(); const r = await c.query(sql, params); ts.push(Number(process.hrtime.bigint() - t) / 1e6); n = r.rowCount; }
  await c.query('reset role');
  ts.sort((a, b) => a - b);
  console.log(`${label.padEnd(52)} median ${ts[Math.floor(runs / 2)].toFixed(1).padStart(6)} ms  p95 ${ts[Math.floor(runs * 0.95)].toFixed(1).padStart(6)} ms  rows ${n}`);
}
const Q = (f) => [JSON.stringify(f)];
await time('search: everything (page 1)', `select id from search_lots($1::jsonb, 49, 0)`, Q({}));
await time('search: cars', `select id from search_lots($1::jsonb, 49, 0)`, Q({ cat: 'cars' }));
await time('search: Toyota HiLux under 30k QLD diesel', `select id from search_lots($1::jsonb, 49, 0)`, Q({ cat: 'utes', make: 'Toyota', model: 'HiLux', max: '30000', state: 'QLD', fuel: 'diesel' }));
await time('search: keyword "hilux"', `select id from search_lots($1::jsonb, 49, 0)`, Q({ q: 'hilux' }));
await time('search: keywords "toyota 2015 qld"', `select id from search_lots($1::jsonb, 49, 0)`, Q({ q: 'toyota qld' }));
await time('search: LAMS bikes sorted by price', `select id from search_lots($1::jsonb, 49, 0)`, Q({ cat: 'motorbikes', lams: '1', sort: 'price' }));
await time('search: caravans sleeps 4, under 6 m', `select id from search_lots($1::jsonb, 49, 0)`, Q({ cat: 'caravans', berths: '4', lenmax: '6' }));
await time('search: page 20 of everything', `select id from search_lots($1::jsonb, 49, 931)`, Q({}));
await time('search: recently closed (60 days)', `select id from search_lots($1::jsonb, 49, 0)`, Q({ view: 'closed' }));
await time('counts: everything', `select lot_facets($1::jsonb)`, Q({}));
await time('counts: utes + Toyota', `select lot_facets($1::jsonb)`, Q({ cat: 'utes', make: 'Toyota' }));
await time('counts: keyword "toyota"', `select lot_facets($1::jsonb)`, Q({ q: 'toyota' }));
// saved-search alerts: 250k saved searches; give 50k of them the new filters, mark 300 lots as just listed
await c.query(`update saved_searches set query = query || jsonb_build_object('make', (array['Toyota','Ford','Isuzu','Yamaha','Jayco'])[1 + (abs(hashtext(id::text)) % 5)], 'fuel', 'diesel') where abs(hashtext(id::text)) % 5 = 0`);
await c.query(`update saved_searches set last_notified_at = now() - interval '1 hour'`);
await c.query(`analyze saved_searches`);
for (const [n, mod] of [[50, 409], [300, 68]]) {
  await c.query('savepoint a');
  await c.query(`update lots set published_at = now() where id in (select id from pick where rn % ${mod} = 0)`);
  let t = Date.now();
  const sent = (await c.query(`select queue_search_alerts() n`)).rows[0].n;
  console.log(`alerts: 250,000 saved searches vs ${n} new listings: ${sent} digests queued in ${Date.now() - t} ms`);
  await c.query('rollback to savepoint a');
}
await c.query('rollback');
await c.end();
