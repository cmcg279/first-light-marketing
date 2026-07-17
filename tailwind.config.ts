import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        coral: { DEFAULT: "#FF5757", 700: "#E03E3E" },
        cream: { DEFAULT: "#FFE9DD" },
        "off-white": "#FFF8EE",
        body: "#1A1A1A",
      },
      fontFamily: {
        serif: ["Fraunces", "Georgia", "serif"],
        sans: ["Public Sans", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        sunburst:
          "radial-gradient(ellipse 120% 80% at 50% 0%, #FFE9DD 0%, #FFD4BB 40%, #FFE9DD 70%, transparent 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "slide-up": "slideUp 0.6s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
