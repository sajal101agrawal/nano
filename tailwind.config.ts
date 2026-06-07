import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Space Grotesk", "system-ui", "-apple-system", "sans-serif"],
        display: ["Syne", "Space Grotesk", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        bg:             "var(--color-bg)",
        "bg-secondary": "var(--color-bg-secondary)",
        "bg-tertiary":  "var(--color-bg-tertiary)",
        "bg-elevated":  "var(--color-bg-elevated)",
        primary:        "var(--color-primary)",
        "text-light":   "var(--color-text-light)",
        "text-dim":     "var(--color-text-dim)",
        "text-muted":   "var(--color-text-muted)",
        border:         "var(--color-border)",
        "border-strong":"var(--color-border-strong)",
        "border-hover": "var(--color-border-hover)",
        "bg-hover":     "var(--color-bg-hover)",
        "bg-active":    "var(--color-bg-active)",
        "glass-bg":     "var(--color-glass-bg)",
        "section-alt":  "var(--color-section-alt)",
      },
      borderRadius: {
        sm:  "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        md:  "var(--radius-md)",
        lg:  "var(--radius-lg)",
        xl:  "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":       { transform: "translateY(-4px)" },
        },
        "pulse-ring": {
          "0%":   { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
      },
      animation: {
        "fade-up":    "fadeUp 0.35s ease-out forwards",
        "fade-in":    "fadeIn 0.25s ease-out forwards",
        shimmer:      "shimmer 1.6s ease-in-out infinite",
        float:        "float 3s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        spin:         "spin 0.8s linear infinite",
      },
      transitionDuration: {
        "160": "160ms",
        "200": "200ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
