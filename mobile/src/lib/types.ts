// Shapes the app receives. The listing, profile, invoice and fee types are the website's own.
import type { Consultant, Fees, Invoice, Lot, LotFlaw, LotPhoto, LotVideo, Partner, Profile } from "@/lib/types";
import type { Facets, SearchFilters } from "@/lib/search";
import type { Correction } from "@/lib/listing";

export type { Fees, Invoice, Lot, Partner, Profile, Facets, SearchFilters };

export type AppLot = Lot & { cover_url?: string | null };

export interface Me {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  missing: number[];
  watched: number[];
  config: { stripe: boolean; testMode: boolean; sms: boolean };
}

export interface AppConfig {
  fees: Fees;
  minVersion: { ios: string; android: string };
  notice: string | null;
  siteUrl: string;
  phone: string;
  supportEmail: string;
  legalName: string;
  abn: string;
  testMode: boolean;
  stripe: boolean;
  sms: boolean;
  stores?: { ios: string | null; android: string | null };
}

// bidder_mask is a made-up, name-shaped string (never the real name), shown blurred.
export type BidRow = { amount: number; created_at: string; bidder_tag: string; bidder_mask?: string; is_auto: boolean };

/** An approved listing video; `url` plays directly (mp4, mov or webm). */
export type AppVideo = LotVideo & { url: string };
/** The named consultant buyers contact about a listing. */
export type AppConsultant = Consultant & { photo_url: string | null };
/** "Est. $X/wk" for a listing on its all-in price, worked out on the server (no lender is named). */
export interface FinanceEstimate { weekly: number; amount: number; months: number; rate: number; comparison_rate: number; basis: string; buyNow?: boolean }

export interface LotBundle {
  lot: AppLot;
  photos: (LotPhoto & { url: string })[];
  flaws: (LotFlaw & { url: string | null })[];
  videos: AppVideo[];
  consultant: AppConsultant | null;
  finance: FinanceEstimate | null;
  inspector: Partner | null;
  insurers: boolean;
  warranty?: boolean;
  transporter?: Partner | null;
  corrections?: Correction[];
  sale?: { id: number; slug: string; title: string } | null;
  questions: { question: string; answer: string; answered_at: string }[];
  watchers: number;
  similar: AppLot[];
  history: BidRow[];
  fees: Fees;
}

export interface MyLotState {
  my_max: number | null;
  is_leader: boolean | null;
  is_seller: boolean | null;
  watched: boolean;
  invoice_id: string | null;
  last_offer: { amount: number; status: string } | null;
  questions: { question: string; answer: string | null; status: string }[];
}

export type LiveState = Pick<Lot, "status" | "current_bid" | "bid_count" | "ends_at" | "reserve_met" | "leader_id" | "decision_by" | "winner_id" | "sold_price" | "buy_now_price"> & { server_time?: string };

export interface HomeData { ending: AppLot[]; featured: AppLot | null; fresh: AppLot[]; cats: Record<string, number>; cheap: number; total: number }
export interface SearchResult { lots: AppLot[]; hasMore: boolean; page: number; facets: Facets | null; filters: SearchFilters; parts: string[] }

// The seller's own listing: bids (names blurred) and the videos they've added.
export type SellerBid = { amount: number; created_at: string; bidder_mask: string; is_auto: boolean };
export type SellerVideo = { id: string; lot_id: number; title: string; status: string; review_note: string | null; created_at: string; public_path: string | null };

/** Transfer of ownership between payment and collection (the buyer's side). */
export interface TransferRow {
  status: "waiting" | "submitted" | "complete"; registration: "registered" | "unregistered"; rego_state: string | null;
  buyer_choice: string | null; transport: string | null; reference: string | null; review_note: string | null;
  seller_done_at: string | null; proof_count: number;
}
/** The seller's side of the same transfer (seller_lot_transfer). */
export interface SellerTransferRow { registration: string; rego_state: string | null; status: string; buyer_choice: string | null; seller_done_at: string | null; seller_reference: string | null }

export interface InvoiceDetail {
  invoice: Invoice & { lots: { title: string; suburb: string; state: string; vin: string | null; gst_status: string; category: string; backdrop: string; cover_path: string | null } };
  lines: [string, number][];
  total: number;
  gstTotal: number;
  /** Null when there's no transfer step for this sale (yet). Missing from older servers. */
  transfer?: TransferRow | null;
  /** Certificate of sale (PDF, needs the session), once paid in full. */
  certificateUrl?: string | null;
  collection: { id: string; status: string; preferred_day: string; preferred_time: string; confirmed_for: string | null; collector_name: string | null; release_code: string; collected_at: string | null } | null;
  address: string | null;
  claims: { id: string; reason: string; status: string; resolution: string | null; created_at: string }[];
  canClaim: boolean;
  overdueDays: number;
  storagePerDay: number;
  bank: { name: string; bsb: string; account: string; payId: string | null; reference: string } | null;
  seller: { legalName: string; abn: string; phone: string; supportEmail: string };
  pdfUrl: string;
}
