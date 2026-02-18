import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-syne)", "sans-serif"],
        sans: ["var(--font-dm-sans)", "sans-serif"],
      },
      colors: {
        "ink-black": {
          50: "#ebf6f9", 100: "#d7edf4", 200: "#afdae9", 300: "#88c8dd",
          400: "#60b6d2", 500: "#38a3c7", 600: "#2d839f", 700: "#226277",
          800: "#164150", 900: "#0b2128", 950: "#08171c",
        },
        cerulean: {
          50: "#eef5f7", 100: "#dceaef", 200: "#b9d5df", 300: "#96c1cf",
          400: "#73acbf", 500: "#5097af", 600: "#40798c", 700: "#305b69",
          800: "#203c46", 900: "#101e23", 950: "#0b1518",
        },
        "tropical-teal": {
          50: "#eff5f5", 100: "#dfecea", 200: "#bfd9d5", 300: "#9fc6c1",
          400: "#80b3ac", 500: "#609f97", 600: "#4d8079", 700: "#39605b",
          800: "#26403c", 900: "#13201e", 950: "#0d1615",
        },
        "ash-grey": {
          50: "#f2f4f0", 100: "#e6eae1", 200: "#ccd5c3", 300: "#b3c0a5",
          400: "#99aa88", 500: "#80956a", 600: "#667755", 700: "#4d5a3f",
          800: "#333c2a", 900: "#1a1e15", 950: "#12150f",
        },
        cornsilk: {
          50: "#fbf9ea", 100: "#f7f2d4", 200: "#eee5aa", 300: "#e6d87f",
          400: "#ddcb55", 500: "#d5be2a", 600: "#aa9822", 700: "#807219",
          800: "#554c11", 900: "#2b2608", 950: "#1e1b06",
        },
      },
    },
  },
  plugins: [],
};
export default config;
