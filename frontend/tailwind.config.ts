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
        // The default Tailwind slate 500/600 fail WCAG AA as body text on the
        // dark studio panels (4.02:1 and 2.53:1 against #080F1E). The HUD
        // labels are 9-10px, so the AA normal-text threshold of 4.5:1 is the
        // one that applies. These are the same hues, lifted just enough to
        // clear it while keeping the muted/bright hierarchy intact.
        slate: {
          500: "#7A8CA6", // 5.59:1
          600: "#6E8099", // 4.75:1
        },
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
