import type { Metadata, Viewport } from "next";
import { Kalam, Libre_Franklin, Source_Code_Pro } from "next/font/google";
import { cookies } from "next/headers";
import { Providers } from "@/components/providers";
import { brand } from "@/config/brand";
import "./globals.css";

/** Institutional gothic: the face printed on university forms, signs and door sheets. */
const franklin = Libre_Franklin({ variable: "--font-franklin", subsets: ["latin"], display: "swap" });
/** Dry-wipe marker: only for Vele's provisional holds, never for anything confirmed. */
const kalam = Kalam({ variable: "--font-kalam", weight: ["400", "700"], subsets: ["latin"], display: "swap" });
/** Codes, URLs and ids only. */
const sourceCode = Source_Code_Pro({ variable: "--font-code", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: `${brand.name}: your calendar, with an assistant that understands it`, template: `%s · ${brand.name}` },
  description: brand.description,
  applicationName: brand.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f16" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // A saved light/dark override is rendered by the server (cookie set in
  // components/app/theme.ts), so the first paint is right without an inline script.
  const saved = (await cookies()).get("vele-theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  return (
    <html lang="en-GB" data-theme={theme} className={`${franklin.variable} ${kalam.variable} ${sourceCode.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-wall text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
