/** Brand colors come from the project specification. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colours are CSS variables so an approved design can re-theme the site (defaults are set in src/index.css).
        maroon: { DEFAULT: 'rgb(var(--c-maroon) / <alpha-value>)', hover: 'rgb(var(--c-maroon-hover) / <alpha-value>)', strong: 'rgb(var(--c-maroon-strong) / <alpha-value>)', footer: 'rgb(var(--c-maroon-footer) / <alpha-value>)' },
        gold: { DEFAULT: 'rgb(var(--c-gold) / <alpha-value>)', hover: 'rgb(var(--c-gold-hover) / <alpha-value>)', soft: 'rgb(var(--c-gold-soft) / <alpha-value>)' },
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: '#5B6470',
        line: '#E3E5E8',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
