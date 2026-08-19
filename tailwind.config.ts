import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0B0E13",
          panel: "#11151C",
          raised: "#161B24",
          hover: "#1D2430",
        },
        line: {
          DEFAULT: "#222B38",
          strong: "#2E3A4A",
        },
        text: {
          primary: "#E6EAF2",
          secondary: "#93A1B5",
          muted: "#5F6D82",
        },
        long: {
          DEFAULT: "#12B981",
          dim: "rgba(18, 185, 129, 0.14)",
        },
        short: {
          DEFAULT: "#F2555A",
          dim: "rgba(242, 85, 90, 0.14)",
        },
        accent: "#4C8DFF",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["10px", "14px"],
      },
    },
  },
  plugins: [],
};

export default config;
