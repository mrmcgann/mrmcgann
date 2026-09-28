import { Suspense } from "react";
import type { Metadata } from "next";
import { AuctionsClient } from "./AuctionsClient";

export const metadata: Metadata = { title: "Live auctions", description: "Cars, utes and trucks from real owners across Australia. Every one photographed, graded and PPSR-checked." };

// Static page: the results load from the edge-cached search API.
export default function Auctions() {
  return <Suspense fallback={<div className="wrap" style={{ minHeight: "60vh" }} />}><AuctionsClient /></Suspense>;
}
