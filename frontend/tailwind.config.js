/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#1a1a1a',
        surface: '#2a2a2a',
        primary: '#42b883',
        'text-primary': '#e0e0e0',
        'text-secondary': '#a0a0a0',
        border: '#3a3a3a',
      },
    },
  },
  plugins: [],
}
