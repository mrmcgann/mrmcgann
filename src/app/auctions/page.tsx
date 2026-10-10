import { Suspense } from "react";
import type { Metadata } from "next";
import { AuctionsClient } from "./AuctionsClient";

// Every filtered version of this page points search engines at the one main page (filter combinations
// would otherwise make thousands of near-identical pages); the landing pages cover popular searches.
export const metadata: Metadata = {
  title: "Live auctions", description: "Search live auctions for cars, utes, trucks, bikes, caravans, boats and machinery across Australia. Checked, PPSR searched, all-in prices shown.",
  alternates: { canonical: "/auctions" },
};

// Static page: the results load from the edge-cached search API.
export default function Auctions() {
  // The heading is in the first HTML (search engines and slow phones see it before the results load).
  return <Suspense fallback={<div className="wrap" style={{ minHeight: "60vh", paddingTop: 40 }}><h1 className="d3">Live auctions</h1></div>}><AuctionsClient /></Suspense>;
}
