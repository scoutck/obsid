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
    <html lang="en">
      <body className="bg-[#faf9f6] text-zinc-900 h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
