import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { env } from "@/lib/env";
import { ViewerProvider } from "@/components/Viewer";
import { Tracker } from "@/components/Tracker";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta" });
const APP_STORE_ID = /id(\d{6,12})/.exec(process.env.NEXT_PUBLIC_APP_STORE_URL || "")?.[1];
const fraunces = Fraunces({ subsets: ["latin"], style: ["italic"], weight: ["500", "600"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Tyrebiter · Car and truck auctions Australia-wide", template: "%s · Tyrebiter" },
  description: "Online auctions for cars, utes, trucks, bikes, caravans, boats and machinery Australia-wide. Checked against the vehicle, PPSR searched, all-in prices shown.",
  metadataBase: new URL(env.siteUrl),
  // iPhone Safari shows an "Open in the app" banner once the app is on the App Store.
  ...(APP_STORE_ID ? { itunes: { appId: APP_STORE_ID } } : {}),
};

export const viewport: Viewport = { themeColor: "#FFFFFF", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body>
        <ViewerProvider>
        {env.testMode && (
          <div className="demo">Test mode: <b>no real payments, SMS or ID checks.</b> Use SMS code 123456.</div>
        )}
        <Header />
        <main className="page">{children}</main>
        <Footer />
        <Tracker />
        </ViewerProvider>
      </body>
    </html>
  );
}
