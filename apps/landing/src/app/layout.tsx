import type { Metadata } from "next";
import {
  Cabin,
  Open_Sans,
  Raleway,
  Noto_Sans_SC,
  Noto_Sans_JP,
  Noto_Sans_Devanagari,
} from "next/font/google";
import { Providers } from "@/lib/providers";
import { SEO } from "@/lib/brand";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["300"],
  style: ["normal", "italic"],
  variable: "--font-raleway",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["800"],
  style: ["normal", "italic"],
  variable: "--font-open-sans",
  display: "swap",
});

const cabin = Cabin({
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal"],
  variable: "--font-cabin",
  display: "swap",
});

const notoSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sc",
  display: "swap",
});

const notoJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-jp",
  display: "swap",
});

const notoHi = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-hi",
  display: "swap",
});

export const metadata: Metadata = {
  title: SEO.title,
  description: SEO.description,
  openGraph: {
    title: SEO.ogTitle,
    description: SEO.ogDescription,
    type: "website",
    siteName: "Coretta",
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.ogTitle,
    description: SEO.ogDescription,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }} suppressHydrationWarning>
      <body
        className={`${raleway.variable} ${openSans.variable} ${cabin.variable} ${notoSc.variable} ${notoJp.variable} ${notoHi.variable} font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
