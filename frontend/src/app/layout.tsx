import type { Metadata } from "next";
import { Rajdhani, Teko, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});
const teko = Teko({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-teko",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AETHER PITCH — EA SPORTS FC 27 3D WebGL Broadcast & Studio Engine",
  description:
    "EA Sports FC HyperMotion V-grade 3D WebGL broadcast: articulated player avatars, 4 autonomous camera modes, volumetric AR overlays and a 5-stage Azure AI pipeline over 100% synthetic 10Hz telemetry.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${rajdhani.variable} ${teko.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-obsidian font-sans text-slate-200 antialiased">{children}</body>
    </html>
  );
}
