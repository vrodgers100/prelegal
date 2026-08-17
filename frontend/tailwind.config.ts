import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  // Follow the reader's OS preference; the agreement itself stays on white
  // paper in both themes (see globals.css).
  darkMode: "media",
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
