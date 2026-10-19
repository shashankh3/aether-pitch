import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#05070C",
        "panel-ink": "#0B1119",
        tactical: "#00F0FF",
        pitch: "#00FF85",
        crimson: "#FF2A54",
        violetdeep: "#38003C",
        gold: "#FFC24D",
      },
      fontFamily: {
        display: [
          '"Barlow Condensed"',
          '"Arial Narrow"',
          "Impact",
          "ui-sans-serif",
          "sans-serif",
        ],
        tech: ['"Rajdhani"', "ui-monospace", "monospace"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      keyframes: {
        "wipe-diag": {
          "0%": { transform: "translateX(-130%) skewX(-18deg)" },
          "100%": { transform: "translateX(260%) skewX(-18deg)" },
        },
        sheen: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
        scanline: {
          "0%": { top: "-10%", opacity: "0" },
          "12%": { opacity: "0.5" },
          "100%": { top: "110%", opacity: "0" },
        },
      },
      animation: {
        "wipe-diag": "wipe-diag 1s ease-out both",
        sheen: "sheen 2.4s ease-in-out infinite",
        scanline: "scanline 5s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
