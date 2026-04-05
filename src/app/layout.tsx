import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
