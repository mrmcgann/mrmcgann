import { Suspense } from "react";
import type { Metadata } from "next";
import { AuctionsClient } from "./AuctionsClient";

export const metadata: Metadata = { title: "Live auctions", description: "Search cars, utes, trucks, motorbikes, caravans, boats, trailers and machinery across Australia. Every vehicle professionally photographed, graded and PPSR searched." };

// Static page: the results load from the edge-cached search API.
export default function Auctions() {
  return <Suspense fallback={<div className="wrap" style={{ minHeight: "60vh" }} />}><AuctionsClient /></Suspense>;
}
