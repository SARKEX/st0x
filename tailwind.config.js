/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom colors for light mode if needed
        light: {
          primary: '#3B82F6',
          secondary: '#10B981',
          background: '#F9FAFB',
          surface: '#FFFFFF',
          text: '#111827',
        }
      },
    },
  },
  plugins: [],
}