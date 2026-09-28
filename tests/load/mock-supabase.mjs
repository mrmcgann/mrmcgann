// A stand-in for Supabase's HTTP API, used only to load-test the website on its own:
// it answers every query with realistic data after a 10 ms "database" delay and counts
// how many queries each page view causes. Usage: node tests/load/mock-supabase.mjs [port]
import http from 'http';

const PORT = Number(process.argv[2] || 54321);
const DELAY = Number(process.env.MOCK_DELAY_MS || 10);
const counts = {};
let total = 0;

const lot = (id) => ({
  id, status: 'live', title: `2015 Toyota HiLux SR ${id}`, short_title: '2015 Toyota HiLux', subtitle: 'Dual cab. Towbar.', vehicle_type: 'ute', category: 'utes',
  year: 2015, make: 'Toyota', model: 'HiLux', variant: 'SR', body: 'Dual-cab ute', engine: '2.8L diesel', transmission: 'Auto', fuel: 'Diesel',
  odometer: 150000, colour: 'White', seats: 5, keys: 2, suburb: 'Toowoomba', state: 'QLD', postcode: '4350', backdrop: 'sky', take: 'A proper workhorse.',
  owner_note: 'Serviced every 10,000 km.', service_history: 'Full logbook', known_faults: 'None declared', roadworthy_note: null, ppsr_clear: true, ppsr_note: null,
  visual_grade: 'B', grade_paint: 'B', grade_interior: 'B', grade_tyres: 'C', tyre_tread: '5 mm', has_reserve: true, reserve_met: false, buy_now_price: null,
  start_price: 500, current_bid: 12000, bid_count: 14, leader_id: null, starts_at: new Date(Date.now() - 86400000).toISOString(),
  ends_at: new Date(Date.now() + 3 * 86400000).toISOString(), decision_by: null, winner_id: null, sold_price: null, sold_via: null, featured: id === 100001,
  created_at: new Date().toISOString(), cover_path: `lots/${id}/0.jpg`, published_at: new Date().toISOString(), vin: 'MR0FZ29G301234567', rego_plate: '123ABC',
  rego_state: 'QLD', rego_expiry: '2027-03-01', build_date: '03/2015', compliance_date: '04/2015', gvm_kg: null, write_off_status: 'none', stolen_clear: true,
  ppsr_cert_no: '1234', ppsr_checked_at: new Date().toISOString(), gst_status: 'private', service_books: true, video_url: null, disclosures: { accident: 'no', flood: 'no' },
  views: 1234, seller_id: null, updated_at: new Date().toISOString(),
});

function answer(path, method, accept) {
  const one = accept.includes('vnd.pgrst.object');
  const [, , , table] = path.split('?')[0].split('/'); // /rest/v1/<table>
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.split('/')[4].split('?')[0];
    if (fn === 'bid_history') return Array.from({ length: 8 }, (_, i) => ({ amount: 12000 - i * 250, created_at: new Date().toISOString(), bidder_tag: 'A•••7c', is_me: false, is_auto: i % 2 === 0 }));
    if (fn === 'lot_watchers') return 23;
    return null;
  }
  const idm = path.match(/id=eq\.(\d+)/);
  switch (table) {
    case 'lots': return one ? lot(idm ? Number(idm[1]) : 100001) : idm ? [lot(Number(idm[1]))] : Array.from({ length: 49 }, (_, i) => lot(100001 + i));
    case 'settings': return one ? { value: { premium_rate: 0.1, admin_fee: 99, surcharge_rate: 0, card_limit: 5000, nrd_low: 500, nrd_high: 1000, nrd_split: 20000, cancel_fee: 250, cancel_above: 1000 } } : [{ key: 'fees', value: { premium_rate: 0.1 } }, { key: 'auction', value: {} }];
    case 'lot_photos': return Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, lot_id: 100001, path: `lots/100001/${i}.jpg`, angle: null, sort: i }));
    case 'lot_flaws': return Array.from({ length: 3 }, (_, i) => ({ id: `f${i}`, lot_id: 100001, title: `Flaw ${i}`, note: 'Cosmetic', photo_path: null, sort: i }));
    default: return one ? null : [];
  }
}

http.createServer((req, res) => {
  if (req.url === '/__stats') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ total, counts })); }
  if (req.url === '/__reset') { total = 0; for (const k of Object.keys(counts)) delete counts[k]; return res.end('ok'); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const key = req.url.startsWith('/rest/v1/rpc/') ? `rpc/${req.url.split('/')[4].split('?')[0]}` : req.url.split('?')[0].replace('/rest/v1/', '');
    counts[key] = (counts[key] || 0) + 1;
    total++;
    setTimeout(() => {
      if (req.url.startsWith('/auth/v1/')) { res.statusCode = req.url.includes('jwks') ? 200 : 401; res.setHeader('content-type', 'application/json'); return res.end(req.url.includes('jwks') ? '{"keys":[]}' : '{"message":"no session"}'); }
      const data = answer(req.url, req.method, String(req.headers.accept || ''));
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(data));
    }, DELAY);
  });
}).listen(PORT, () => console.log(`mock supabase on ${PORT}`));
