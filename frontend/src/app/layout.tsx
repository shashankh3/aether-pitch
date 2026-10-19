import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AETHER PITCH — Tactical Pulse & Dual-Cast Studio Engine",
  description:
    "EA Sports FC-style live broadcast studio: synthetic 10Hz tracking, Control-vs-Chaos entropy, PlayerLock 360, ghost passes and dual-persona AI commentary.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-obsidian text-slate-200 antialiased">{children}</body>
    </html>
  );
}
