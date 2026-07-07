export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        page: "#0e121b",
        surface: "#0e121b",
        weak: "#181b25",
        soft: "#2b303b",
        primary: "#335cff",
        "primary-dark": "#2547d0",
        success: "#1daf61",
        "success-text": "#3ee089",
        error: "#e93544",
        "error-text": "#ff6875",
        "text-strong": "#ffffff",
        "text-sub": "#99a0ae",
        "text-soft": "#717784",
        border: "#2b303b"
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { panel: "16px", btn: "10px", nav: "8px" }
    }
  },
  plugins: []
}
