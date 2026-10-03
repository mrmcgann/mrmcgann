// Shapes the app receives. The listing, profile, invoice and fee types are the website's own.
import type { Fees, Invoice, Lot, LotFlaw, LotPhoto, Profile } from "@/lib/types";
import type { Facets, SearchFilters } from "@/lib/search";

export type { Fees, Invoice, Lot, Profile, Facets, SearchFilters };

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

export type BidRow = { amount: number; created_at: string; bidder_tag: string; is_auto: boolean };

export interface LotBundle {
  lot: AppLot;
  photos: (LotPhoto & { url: string })[];
  flaws: (LotFlaw & { url: string | null })[];
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
  inspection: { day: string; time: string; status: string } | null;
  questions: { question: string; answer: string | null; status: string }[];
}

export type LiveState = Pick<Lot, "status" | "current_bid" | "bid_count" | "ends_at" | "reserve_met" | "leader_id" | "decision_by" | "winner_id" | "sold_price" | "buy_now_price"> & { server_time?: string };

export interface HomeData { ending: AppLot[]; featured: AppLot | null; fresh: AppLot[]; cats: Record<string, number>; cheap: number; total: number }
export interface SearchResult { lots: AppLot[]; hasMore: boolean; page: number; facets: Facets | null; filters: SearchFilters; parts: string[] }

export interface InvoiceDetail {
  invoice: Invoice & { lots: { title: string; suburb: string; state: string; vin: string | null; gst_status: string; category: string; backdrop: string; cover_path: string | null } };
  lines: [string, number][];
  total: number;
  gstTotal: number;
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
