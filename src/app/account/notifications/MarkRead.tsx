"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MarkRead() {
  const router = useRouter();
  useEffect(() => { fetch("/api/notifications/read", { method: "POST" }).then(() => router.refresh()).catch(() => {}); }, [router]);
  return null;
}
