export type Grade = "A" | "B" | "C" | "D" | "E";
export type LotStatus = "draft" | "scheduled" | "live" | "referred" | "offers" | "sold" | "passed" | "cancelled";

export interface Lot {
  id: number;
  status: LotStatus;
  title: string;
  short_title: string | null;
  subtitle: string | null;
  vehicle_type: "car" | "ute" | "truck";
  category: "cars" | "utes" | "trucks";
  year: number | null;
  make: string | null;
  model: string | null;
  variant: string | null;
  body: string | null;
  engine: string | null;
  transmission: string | null;
  fuel: string | null;
  odometer: number | null;
  colour: string | null;
  seats: number | null;
  keys: number | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  backdrop: string;
  take: string | null;
  owner_note: string | null;
  service_history: string | null;
  known_faults: string | null;
  roadworthy_note: string | null;
  ppsr_clear: boolean | null;
  ppsr_note: string | null;
  visual_grade: Grade | null;
  grade_paint: Grade | null;
  grade_interior: Grade | null;
  grade_tyres: Grade | null;
  tyre_tread: string | null;
  has_reserve: boolean;
  reserve_met: boolean;
  buy_now_price: number | null;
  start_price: number;
  current_bid: number;
  bid_count: number;
  leader_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  decision_by: string | null;
  winner_id: string | null;
  sold_price: number | null;
  sold_via: string | null;
  featured: boolean;
  created_at: string;
}

export interface LotPhoto { id: string; lot_id: number; path: string; angle: string | null; sort: number }
export interface LotFlaw { id: string; lot_id: number; title: string; note: string | null; photo_path: string | null; sort: number }

export interface Profile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  mobile: string | null;
  mobile_verified: boolean;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  intent: string | null;
  details_done: boolean;
  payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  id_status: "none" | "pending" | "verified" | "failed";
  role: "buyer" | "admin";
  suspended: boolean;
  notify: Record<string, { sms: boolean; email: boolean }>;
}

export interface Invoice {
  id: string;
  ref: string;
  lot_id: number;
  buyer_id: string;
  sold_via: string;
  price: number;
  premium: number;
  gst: number;
  admin_fee: number;
  subtotal: number;
  mode: "card" | "deposit";
  card_amount: number;
  surcharge: number;
  balance_due: number;
  total: number;
  status: "pending_charge" | "paid" | "deposit_paid" | "payment_failed" | "cancelled";
  failure_reason: string | null;
  due_at: string | null;
  paid_at: string | null;
  balance_paid_at: string | null;
  cancel_fee: number | null;
  collector_name: string | null;
  collector_mobile: string | null;
  collected_at: string | null;
  created_at: string;
}

export interface Fees {
  premium_rate: number;
  admin_fee: number;
  surcharge_rate: number;
  card_limit: number;
  nrd_low: number;
  nrd_high: number;
  nrd_split: number;
  cancel_fee: number;
  cancel_above: number;
}

export const DEFAULT_FEES: Fees = {
  premium_rate: 0.1, admin_fee: 99, surcharge_rate: 0.012, card_limit: 5000,
  nrd_low: 500, nrd_high: 1000, nrd_split: 20000, cancel_fee: 250, cancel_above: 1000,
};
