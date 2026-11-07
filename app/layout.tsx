import type { Metadata } from "next";
import { JetBrains_Mono, Noto_Sans_Devanagari, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import Shell from "@/components/Shell";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
});

const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-deva",
});

const tamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-tamil",
});

export const metadata: Metadata = {
  title: "Udyam Digital | Accel Business",
  description: "Connectivity for small businesses. A bundle, a monthly price and verification in one sitting.",
  other: {
    "page-type": "software",
    "site-kind": "software",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-type="software" data-radius="soft" data-buttons="pill" data-motion="on" className={`${mono.variable} ${devanagari.variable} ${tamil.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+Devanagari:wght@500;600&family=Noto+Serif+Tamil:wght@500;600&family=Reddit+Sans:wght@400;500&family=Source+Serif+4:wght@500;600&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#f7f9f8" />
      </head>
      <body>
        <LanguageProvider>
          <Shell>{children}</Shell>
        </LanguageProvider>
      </body>
    </html>
  );
}
