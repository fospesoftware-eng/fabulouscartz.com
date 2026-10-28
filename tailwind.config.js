/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        serif: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      colors: {
        // Light theme tokens — driven via CSS vars at runtime too
        cream: "#FAF6F0",
        champagne: "#E8DCC4",
        emerald: {
          50: "#EAF4EC",
          100: "#C8E3CD",
          200: "#8DC79B",
          300: "#4EA766",
          400: "#2E8B57",
          500: "#1B6B43",
          600: "#0F4A2D",
          700: "#08301C",
        },
        gold: {
          50: "#FBF5E4",
          100: "#F3E5B8",
          200: "#E6CE85",
          300: "#D4B156",
          400: "#B8913A",
          500: "#8E6B27",
          600: "#6A4F1B",
        },
        rose: {
          100: "#F5DED4",
          200: "#E7B7A1",
          300: "#D18A6E",
          400: "#B56A4D",
        },
        ink: {
          50: "#F5F4F1",
          100: "#E7E4DD",
          200: "#C9C4B7",
          300: "#9C9688",
          400: "#6A6558",
          500: "#444039",
          600: "#25231F",
          700: "#141310",
        },
      },
      backgroundImage: {
        "gradient-luxury":
          "linear-gradient(135deg, #1B6B43 0%, #0F4A2D 35%, #2E8B57 65%, #8DC79B 100%)",
        "gradient-champagne":
          "linear-gradient(135deg, #F3E5B8 0%, #E6CE85 40%, #B8913A 100%)",
        "gradient-ink":
          "linear-gradient(180deg, #141310 0%, #25231F 100%)",
        "gradient-hero":
          "radial-gradient(ellipse at 20% 20%, rgba(46,139,87,0.18) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(184,145,58,0.15) 0%, transparent 55%), linear-gradient(180deg, #FAF6F0 0%, #F5EFE4 100%)",
        "gradient-hero-dark":
          "radial-gradient(ellipse at 20% 20%, rgba(141,199,155,0.12) 0%, transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(212,177,86,0.12) 0%, transparent 55%), linear-gradient(180deg, #0F1410 0%, #08301C 100%)",
      },
      boxShadow: {
        luxury: "0 30px 60px -20px rgba(27,107,67,0.15), 0 10px 30px -10px rgba(0,0,0,0.06)",
        gold: "0 0 40px rgba(184,145,58,0.25), 0 10px 30px rgba(0,0,0,0.08)",
      },
      letterSpacing: {
        luxury: "0.28em",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        floaty: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        rotateSlow: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
      },
      animation: {
        shimmer: "shimmer 4s linear infinite",
        floaty: "floaty 6s ease-in-out infinite",
        rotateSlow: "rotateSlow 40s linear infinite",
      },
    },
  },
  plugins: [],
};
