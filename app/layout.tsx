import type { Metadata } from "next";
import { Anton, Geist_Mono, Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";
import { AuroraBackground } from "./_components/AuroraBackground";

const hanken = Hanken_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const newsreader = Newsreader({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const anton = Anton({
  variable: "--font-anton",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ghostwriter",
  description: "Write in your own voice. Powered by your own writing samples.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${hanken.variable} ${newsreader.variable} ${geistMono.variable} ${anton.variable} antialiased`}
      >
        <AuroraBackground />
        <div className="relative" style={{ zIndex: 2 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
