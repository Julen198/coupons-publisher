import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { THEME_SCRIPT } from "./theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CuponLab",
  description: "Panel para generar páginas de cupones para medios",
  robots: { index: false, follow: false },
};

// Typed by hand: LayoutProps<"/"> also lists the (site) group's @modal slot, which only the site layout receives
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script adds the "dark" class before React hydrates
    <html lang="es" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* suppressHydrationWarning: browser extensions rewrite <head> scripts before React hydrates */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before hydration */}
      <body suppressHydrationWarning className="min-h-full">
        {children}
        {/* Vercel Web Analytics: cookieless page views, alongside Google Analytics on the public site */}
        <Analytics />
      </body>
    </html>
  );
}
