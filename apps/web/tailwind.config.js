/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        stellar: {
          50: '#eefbf3',
          100: '#d6f5e0',
          200: '#b0eac5',
          300: '#7cd9a3',
          400: '#47c07d',
          500: '#24a563',
          600: '#15854e',
          700: '#116a41',
          800: '#105435',
          900: '#0e452d',
          950: '#06271a',
        },
        bezamint: {
          primary: '#24a563',
          secondary: '#7cd9a3',
          dark: '#06271a',
          light: '#eefbf3',
          accent: '#47c07d',
          surface: '#0a0f1a',
          card: '#111827',
          muted: '#374151',
          border: '#1f2937',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'gradient-x': 'gradient-x 3s ease infinite',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'slide-up': 'slide-up 0.5s ease-out',
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': {
            'background-size': '200% 200%',
            'background-position': 'left center',
          },
          '50%': {
            'background-size': '200% 200%',
            'background-position': 'right center',
          },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
