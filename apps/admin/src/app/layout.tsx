import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BRAND, COLORS } from "@bevital/shared";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} Admin`, template: `%s · ${BRAND.name} Admin` },
  description: `${BRAND.fullTagline} — operations portal`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: COLORS.primary, width: "device-width", initialScale: 1 };

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const cssVars = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [`--bv-${kebab(k)}`, v])) as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`} style={cssVars}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
