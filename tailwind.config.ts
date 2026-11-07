import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f7f9f8",
        surface: "#ebf0ee",
        ink: "#06525c",
        muted: "#2f737d",
        action: "#06525c",
        "action-ink": "#f7f9f8",
        line: "rgba(6, 82, 92, 0.14)",
        background: "var(--p-bg)",
        foreground: "var(--p-ink)",
        slate: {
          50: "#f7f9f8",
          100: "#ebf0ee",
          200: "#d7e3e0",
          300: "#b7ccc8",
          400: "#6f969c",
          500: "#3d7c86",
          600: "#2f737d",
          700: "#1a5c66",
          800: "#0c4650",
          900: "#06525c",
          950: "#04343a",
        },
      },
      fontFamily: {
        sans: ["Reddit Sans", "var(--font-deva)", "var(--font-tamil)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "500",
        bold: "500",
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "8px",
        md: "12px",
        lg: "12px",
        xl: "20px",
        "2xl": "20px",
        "3xl": "20px",
      },
      boxShadow: {
        none: "none",
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
      },
    },
  },
  plugins: [],
};
export default config;
