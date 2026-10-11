import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeesCached } from "@/lib/cache";
import { payIdEnabled } from "@/lib/payid";
import { env } from "@/lib/env";
import { AccountNav } from "../AccountNav";
import { DepositHome, type MyDeposit } from "./DepositHome";

export const metadata: Metadata = { title: "Bidding deposit" };
export const dynamic = "force-dynamic";

export default async function DepositPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, user, profile } = await getSession();
  if (!user || !profile) redirect("/signin?next=/account/deposit");
  const [{ data }, fees] = await Promise.all([supabase.rpc("my_deposit"), getFeesCached()]);
  // Without deposits (the default), this page is only for someone who still has one from before.
  const d = data as MyDeposit | null;
  if (profile.pay_mode !== "deposit" && !(d && (d.balance > 0 || d.history.length))) redirect("/account");
  const bid = Math.round(Number(sp.bid) || 0);
  const lot = Number(sp.lot) || 0;
  return (
    <div className="wrap">
      <div className="acctgrid">
        <AccountNav current="deposit" profile={profile} />
        <DepositHome d={data as MyDeposit} fees={fees} bank={{ name: env.bankName, bsb: env.bankBsb, account: env.bankAccount, payId: env.payId || null }}
          payIdOn={payIdEnabled()} testMode={env.testMode} target={bid > 0 ? bid : null} back={lot ? { href: `/lot/${lot}`, label: "Back to the vehicle" } : null}
          name={profile.first_name || ""} />
      </div>
    </div>
  );
}
