import type { Metadata } from "next";
import { Newsreader, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Obsid",
  description: "AI-powered knowledge base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="font-[var(--font-ui)] bg-[var(--bg-primary)] text-zinc-900 h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
