export type Grade = "A" | "B" | "C" | "D" | "E";
export type LotStatus = "draft" | "scheduled" | "live" | "referred" | "offers" | "sold" | "passed" | "cancelled";

export interface Lot {
  id: number;
  status: LotStatus;
  title: string;
  short_title: string | null;
  subtitle: string | null;
  vehicle_type: import("./vehicles").VehicleType;
  category: import("./vehicles").CategoryKey;
  kind?: string | null;
  drive?: "2WD" | "4WD" | "AWD" | null;
  engine_cc?: number | null;
  hours?: number | null;
  licence_class?: string | null;
  lams?: boolean | null;
  berths?: number | null;
  length_m?: number | null;
  fuel_group?: string | null;
  trans_group?: string | null;
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
  cover_path?: string | null;
  published_at?: string | null;
  vin?: string | null;
  rego_plate?: string | null;
  rego_state?: string | null;
  rego_expiry?: string | null;
  registration?: "registered" | "unregistered" | null;
  engine_no?: string | null;
  runs?: "drives" | "starts" | "no_start" | "untested" | null;
  seller_type?: "private" | "business" | null;
  verified?: string[] | null;
  verified_at?: string | null;
  ev_battery_soh?: number | null;
  ev_battery_report?: string | null;
  relisted_from?: number | null;
  corrected_at?: string | null;
  sale_id?: number | null;
  build_date?: string | null;
  compliance_date?: string | null;
  gvm_kg?: number | null;
  write_off_status?: "none" | "repairable" | "statutory" | "unknown";
  stolen_clear?: boolean | null;
  ppsr_cert_no?: string | null;
  ppsr_checked_at?: string | null;
  gst_status?: "private" | "inc";
  service_books?: boolean | null;
  video_url?: string | null;
  disclosures?: Disclosures;
  views?: number;
  seller_id?: string | null;
  consultant_id?: string | null;
}

// What the seller declared when they signed the agency agreement (shown on the listing).
export interface Disclosures {
  accident?: string; flood?: string; hail?: string; write_off?: string; modifications?: string;
  odometer_concerns?: string; finance?: string; keys?: string; service_books?: boolean | string;
  known_faults?: string; warning_lights?: string; rego_expiry?: string; starts_and_drives?: string; business?: string;
}

export interface LotPhoto { id: string; lot_id: number; path: string; angle: string | null; sort: number; credit?: string | null; credit_url?: string | null }
export interface LotVideo { id: string; public_path: string; title: string; approved_at: string | null }
export interface Consultant { id: string; name: string; title: string; phone: string | null; email: string | null; photo_path: string | null; is_default: boolean }

// Finance, insurance and mobile-inspection partners (see /finance, /insurance and the listing page).
export type PartnerKind = "finance" | "insurance" | "inspection" | "transport" | "warranty";
export interface Partner {
  id: string; kind: PartnerKind; slug: string; name: string; licence: string | null; blurb: string | null; logo_path: string | null;
  rate_from: number | null; comparison_rate: number | null; comparison_basis: string | null;
  establishment_fee: number | null; monthly_fee: number | null; min_amount: number | null; max_amount: number | null;
  min_term_months: number | null; max_term_months: number | null; price_from: number | null; turnaround: string | null;
  features: Record<string, string | number | boolean>; pds_url: string | null; tmd_url: string | null; privacy_url: string | null;
  referral_url: string | null; accepts_leads: boolean; commission_note: string | null; sponsored: boolean; sample: boolean; sort: number; active: boolean; updated_at?: string;
}
export interface FinanceSettings { show_on_listings?: boolean; min_price?: number; term_months?: number; deposit_pct?: number }
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
  terms_version?: string | null;
  company_name?: string | null;
  abn?: string | null;
  // from me()
  watch_count?: number;
  unread?: number;
  is_seller?: boolean;
  terms_current?: boolean;
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
  status: "pending_charge" | "charging" | "paid" | "deposit_paid" | "payment_failed" | "cancelled";
  failure_reason: string | null;
  due_at: string | null;
  paid_at: string | null;
  balance_paid_at: string | null;
  cancel_fee: number | null;
  collector_name: string | null;
  collector_mobile: string | null;
  collected_at: string | null;
  created_at: string;
  vehicle_gst?: number;
  collect_by?: string | null;
  claim_until?: string | null;
  storage_fee?: number;
  charge_attempts?: number;
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
  storage_per_day?: number;
  seller_fee_rate?: number;
  seller_fee_min?: number;
  withdrawal_fee?: number;
}

export const DEFAULT_FEES: Fees = {
  premium_rate: 0.1, admin_fee: 99, surcharge_rate: 0, card_limit: 5000,
  nrd_low: 500, nrd_high: 1000, nrd_split: 20000, cancel_fee: 250, cancel_above: 1000,
  storage_per_day: 50, seller_fee_rate: 0, seller_fee_min: 0, withdrawal_fee: 250,
};

export const TERMS_VERSION = "2026-10-01";

export interface Sale {
  id: number;
  slug: string;
  title: string;
  intro: string | null;
  seller_label: string | null;
  state: string | null;
  published: boolean;
}
