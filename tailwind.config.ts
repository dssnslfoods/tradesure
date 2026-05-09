import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        crypto: {
          bg: "#0b0e14",
          panel: "#11151d",
          border: "#1f2633",
          accent: "#f7931a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
