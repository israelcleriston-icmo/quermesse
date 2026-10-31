import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// Modos: development (vite dev) | training (--mode training) | production (padrão do build)
export default defineConfig(({ mode }) => {
  const treino = mode === "training";
  const dev = mode === "development";
  const nome = treino ? "Quermesse (Treinamento)" : dev ? "Quermesse (Dev)" : "Quermesse";
  const sufixo = treino ? "-training" : "";
  return {
    base: "/",
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          id: treino ? "/quermesse-treinamento" : "/quermesse",
          name: nome,
          short_name: treino ? "Quermesse TREIN." : "Quermesse",
          lang: "pt-BR",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          theme_color: treino ? "#c2410c" : "#1f56d1",
          background_color: "#eef5ff",
          icons: [
            { src: `icons/icon-192${sufixo}.png`, sizes: "192x192", type: "image/png" },
            { src: `icons/icon-512${sufixo}.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        workbox: { navigateFallback: "index.html", globPatterns: ["**/*.{js,css,html,png,svg}"] },
      }),
    ],
    test: { include: ["src/**/*.test.ts"] },
  };
});
