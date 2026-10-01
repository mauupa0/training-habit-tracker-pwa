import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Newsreader, JetBrains_Mono } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

// latin-ext = ogonki. Bez tego ą/ć/ę/ł/ń/ó/ś/ź/ż lecą na fallback systemowy.
// next/font pobiera pliki w czasie builda i serwuje z własnego origin - działa offline.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin-ext"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin-ext"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "System",
  description: "Dziennik treningowy",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "System",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  // Bez tego iOS nakłada własne przyciemnienie i tekst znika.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E2E7DE" },
    { media: "(prefers-color-scheme: dark)", color: "#12191F" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Klasy krojów muszą siedzieć na <html>, a nie na <body>: tokens.css składa
    // z nich --typeface-* w :root, a zmienna zdefiniowana niżej byłaby tam nieznana
    // i cała deklaracja font-family przepadałaby po cichu.
    <html lang="pl" className={`${bricolage.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
