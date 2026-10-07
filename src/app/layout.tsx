import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  applicationName: "AI Traitors",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "AI Traitors",
    description: "Multiplayer Traitors with AI castmates — Faithfuls vs Traitors.",
    images: [{ url: "/opengraph-image.jpg", width: 1024, height: 1024, alt: "Traitors" }],
  },
  twitter: {
    card: "summary",
    title: "AI Traitors",
    description: "Multiplayer Traitors with AI castmates — Faithfuls vs Traitors.",
    images: ["/opengraph-image.jpg"],
  },
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
        <Analytics />
      </body>
    </html>
  );
}
