import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  // Follow the reader's OS preference; the agreement itself stays on white
  // paper in both themes (see globals.css).
  darkMode: "media",
  theme: {
    extend: {
      // The Prelegal palette. Available everywhere; the agreement pages keep
      // their neutral paper styling on purpose.
      colors: {
        brand: {
          navy: "#032147",
          blue: "#209dd7",
          purple: "#753991",
          yellow: "#ecad0a",
          gray: "#888888",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
