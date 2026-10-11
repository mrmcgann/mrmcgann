"use client";
import { useRouter } from "next/navigation";

export function CancelViewing({ id }: { id: string }) {
  const router = useRouter();
  return <button className="linkbtn" style={{ fontSize: 14 }} onClick={async () => { if (!confirm("Cancel this booking?")) return; await fetch(`/api/viewings/${id}`, { method: "DELETE" }); router.refresh(); }}>Cancel</button>;
}
