/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        darkBg: '#0b111e',
        darkCard: '#111a2e',
        darkBorder: '#1e293b',
      }
    },
  },
  plugins: [],
}