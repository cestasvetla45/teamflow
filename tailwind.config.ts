import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "#14141c",
        "surface-raised": "#1b1b26",
        border: "#27272f",
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
          muted: "#4338ca",
        },
      },
    },
  },
  plugins: [],
};
export default config;
