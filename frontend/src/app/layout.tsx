import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mutual NDA creator — Prelegal",
  description:
    "Fill in a short form and get a complete, signable Mutual Non-Disclosure Agreement you can download.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
