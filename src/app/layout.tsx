import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { env } from "@/lib/env";
import { ViewerProvider } from "@/components/Viewer";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-jakarta" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["italic"], weight: ["500", "600"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Tyrebiter · Car and truck auctions Australia-wide", template: "%s · Tyrebiter" },
  description: "Online auctions for cars, utes, trucks, motorbikes, caravans, boats and machinery, sold on behalf of their owners across Australia. Photographed beautifully, described honestly.",
  metadataBase: new URL(env.siteUrl),
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
        </ViewerProvider>
      </body>
    </html>
  );
}
