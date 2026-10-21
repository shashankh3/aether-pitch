import type { Metadata, Viewport } from "next";
import { Rajdhani, Teko, Inter, JetBrains_Mono } from "next/font/google";
import StudioErrorBoundary from "@/components/StudioErrorBoundary";
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
    "A cinematic 3D WebGL football broadcast: articulated avatars, autonomous camera direction, volumetric AR tactics, DVR telestration and an Azure-ready 5-stage AI pipeline over 100% synthetic 10 Hz telemetry.",
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
      "A cinematic 3D WebGL football broadcast with autonomous cameras, volumetric AR and an Azure-ready 5-stage AI pipeline.",
  },
  twitter: {
    card: "summary",
    title: "AETHER PITCH — Cinematic 3D Football Broadcast & AI Studio",
    description:
      "A cinematic 3D WebGL football broadcast with autonomous cameras, volumetric AR and an Azure-ready 5-stage AI pipeline.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04060A",
  colorScheme: "dark",
};

// The studio is a live dashboard, never a static page. Rendering per request
// lets the server read the runtime environment and inline the backend
// coordinates into the HTML — `NEXT_PUBLIC_*` variables would be frozen at
// build time and would point a deployed container at the wrong host.
export const dynamic = "force-dynamic";

function runtimeConfig(): { apiBase: string; wsUrl: string } {
  const api = (process.env.AETHER_API_URL ?? "").replace(/\/+$/, "");
  const ws = (process.env.AETHER_WS_URL ?? "").trim();
  return {
    // Unset in production means "same origin" (the Next.js server proxies
    // /api and /ws to the engine). In dev the engine lives on :8000.
    apiBase: api || (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000"),
    wsUrl: ws,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = runtimeConfig();
  return (
    <html lang="en" className={`dark ${rajdhani.variable} ${teko.variable} ${inter.variable} ${jetbrains.variable}`}>
      <head>
        <script
          id="aether-runtime-config"
          dangerouslySetInnerHTML={{
            __html: `window.__AETHER_CONFIG__=${JSON.stringify(config)};`,
          }}
        />
      </head>
      <body className="bg-obsidian font-sans text-slate-200 antialiased">
        <StudioErrorBoundary label="studio">
          {children}
        </StudioErrorBoundary>
      </body>
    </html>
  );
}
