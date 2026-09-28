import Link from "next/link";
import { CarArt } from "@/components/CarArt";

export default function NotFound() {
  return (
    <div className="wrap">
      <div className="center hero">
        <div className="stage bg-sun" style={{ width: "min(520px,100%)", aspectRatio: "1.6", borderRadius: 32 }}><CarArt flip /></div>
        <h1 className="d2">This one&apos;s driven off.</h1>
        <p className="lede">We couldn&apos;t find that page. It may have sold, or the link may be wrong.</p>
        <Link className="btn btn-blue" href="/auctions">See live auctions</Link>
      </div>
    </div>
  );
}
