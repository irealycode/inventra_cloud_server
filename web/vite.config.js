import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// In dev, proxy API calls to the FastAPI server so the SPA can use same-origin
// relative paths (which also work in production when FastAPI serves the build).
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5180,
        proxy: {
            "/api": "http://localhost:32950",
            "/admin": "http://localhost:32950",
            "/health": "http://localhost:32950",
        },
    },
    build: { outDir: "dist" },
});
