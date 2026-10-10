import type { Metadata } from "next";
import { env } from "@/lib/env";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact us", description: "Contact Tyrebiter about buying, selling, a purchase or a listing. Phone, email or send us a message.", alternates: { canonical: "/contact" } };

export default function Contact() {
  return (
    <div className="wrap" style={{ maxWidth: 760, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 22 }}>
      <h1 className="d2">Talk to us.</h1>
      <p className="lede" style={{ margin: 0 }}>Call {env.phone} (Monday to Friday, 8:30 am to 5 pm AEST) or send a message and we&apos;ll reply within 1 business day.</p>
      <div className="notice"><b>Scam check:</b> we never ask you to pay a seller directly, and our bank details never change by email or SMS. If something looks off, call us before you pay.</div>
      <ContactForm />
      <p className="hint">{env.legalName} · ABN {env.abn} · {env.address}</p>
    </div>
  );
}
