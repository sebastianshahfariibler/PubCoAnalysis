import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          925: "#111113",
          950: "#0c0c0e",
        },
      },
      typography: {
        invert: {
          css: {
            "--tw-prose-body": "#d1d5db",
            "--tw-prose-headings": "#f9fafb",
            "--tw-prose-lead": "#9ca3af",
            "--tw-prose-links": "#60a5fa",
            "--tw-prose-bold": "#f9fafb",
            "--tw-prose-counters": "#9ca3af",
            "--tw-prose-bullets": "#4b5563",
            "--tw-prose-hr": "#1f2937",
            "--tw-prose-quotes": "#f3f4f6",
            "--tw-prose-quote-borders": "#374151",
            "--tw-prose-captions": "#9ca3af",
            "--tw-prose-code": "#f9fafb",
            "--tw-prose-pre-code": "#d1d5db",
            "--tw-prose-pre-bg": "#1f2937",
            "--tw-prose-th-borders": "#374151",
            "--tw-prose-td-borders": "#1f2937",
          },
        },
      },
    },
  },
  plugins: [],
};

export default config;
