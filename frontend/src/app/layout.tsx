import type { Metadata, Viewport } from "next";
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
  title: {
    default: "AETHER PITCH — Cinematic 3D Football Broadcast & AI Studio",
    template: "%s · AETHER PITCH",
  },
  description:
    "A cinematic 3D WebGL football broadcast: articulated avatars, autonomous camera direction, volumetric AR tactics, DVR telestration and a 5-stage Azure AI pipeline over 100% synthetic 10 Hz telemetry.",
  applicationName: "AETHER PITCH",
  keywords: [
    "3D football broadcast", "WebGL", "React Three Fiber", "Azure AI Foundry",
    "sports analytics", "real-time telemetry", "broadcast graphics", "tactical analysis",
  ],
  authors: [{ name: "AETHER PITCH" }],
  creator: "AETHER PITCH",
  openGraph: {
    type: "website",
    siteName: "AETHER PITCH",
    title: "AETHER PITCH — Cinematic 3D Football Broadcast & AI Studio",
    description:
      "A cinematic 3D WebGL football broadcast with autonomous cameras, volumetric AR and a 5-stage Azure AI pipeline.",
  },
  twitter: {
    card: "summary",
    title: "AETHER PITCH — Cinematic 3D Football Broadcast & AI Studio",
    description:
      "A cinematic 3D WebGL football broadcast with autonomous cameras, volumetric AR and a 5-stage Azure AI pipeline.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04060A",
  colorScheme: "dark",
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
