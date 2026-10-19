import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#04060A",
        "panel-ink": "#0B1119",
        tactical: "#00F0FF",
        pitch: "#00FF85",
        crimson: "#FF1E56",
        gold: "#FFC24D",
        navy: "#0A1A2F",
        violetdeep: "#38003C",
      },
      fontFamily: {
        display: ["var(--font-teko)", '"Arial Narrow"', "Impact", "sans-serif"],
        tech: ["var(--font-rajdhani)", "ui-monospace", "monospace"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      keyframes: {
        sheen: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(320%)" },
        },
      },
      animation: {
        sheen: "sheen 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
