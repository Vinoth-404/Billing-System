/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#EAF4FF",     // Soft Sky Blue (#EAF4FF)
          primary: "#4DA6FF",   // Primary Light Blue (#4DA6FF)
          accent: "#2196F3",    // Accent (#2196F3)
          text: "#1E293B",      // Slate 800
          subtext: "#64748B",   // Slate 500
          border: "#E2E8F0",    // Slate 200
          success: "#10B981",   // Emerald 500
          warning: "#F59E0B",   // Amber 500
          danger: "#EF4444",    // Red 500
        }
      },
      fontFamily: {
        sans: ["Outfit", "Inter", "sans-serif"],
      },
      boxShadow: {
        premium: "0 4px 20px -2px rgba(77, 166, 255, 0.08), 0 2px 10px -1px rgba(77, 166, 255, 0.04)",
        glass: "0 8px 32px 0 rgba(77, 166, 255, 0.05)",
      }
    },
  },
  plugins: [],
}
