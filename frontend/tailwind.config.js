/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", 'sans-serif'],
        serif: ["'DM Serif Display'", 'serif'],
      },
      colors: {
        bg: '#0f0e0c',
        surface: '#1a1916',
        s2: '#222120',
        s3: '#2a2927',
        gold: '#c9a84c',
        green: '#5a9e6f',
        amber: '#c97c2e',
        'text-primary': '#f0ede6',
        'text-2': '#9a9690',
        'text-3': '#5a5752',
      },
    },
  },
  plugins: [],
};
