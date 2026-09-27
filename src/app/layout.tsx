import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { WebAppFontBoost } from "@/components/WebAppFontBoost";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const body = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "AI Traitors",
  description: "Multiplayer Traitors with AI castmates — Faithfuls vs Traitors.",
  appleWebApp: {
    capable: true,
    title: "AI Traitors",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0c0a09",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WebAppFontBoost />
        {children}
      </body>
    </html>
  );
}
