import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

/** Garante o formato "/" ou "/nome/" (começa e termina com barra). */
export function normalizarBase(valor?: string): string {
  const v = (valor ?? "").trim();
  if (!v || v === "/") return "/";
  return `/${v.replace(/^\/+|\/+$/g, "")}/`;
}

// Modos: development (vite dev) | training (--mode training) | production (padrão do build)
export default defineConfig(({ mode }) => {
  const treino = mode === "training";
  const dev = mode === "development";
  const nome = treino ? "Quermesse (Treinamento)" : dev ? "Quermesse (Dev)" : "Quermesse";
  const sufixo = treino ? "-training" : "";
  // Endereço-base do site. Domínio próprio (www.quermesse.app.br, treinamento.quermesse.app.br) = "/".
  // Endereço de projeto do GitHub (israelcleriston-icmo.github.io/quermesse/) = "/quermesse/".
  // Quem decide é a variável VITE_BASE na hora do build; sem ela, vale "/".
  const base = normalizarBase(process.env.VITE_BASE);
  return {
    base,
    plugins: [
      // Ícone e favicon do treinamento têm a faixa laranja "TREINO"
      { name: "icones-por-ambiente", transformIndexHtml: { order: "pre" as const, handler: (html: string) => html.replaceAll("__SUFIXO__", sufixo) } },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          id: `${base}${treino ? "?app=treinamento" : ""}`,
          name: nome,
          short_name: treino ? "Quermesse TREIN." : "Quermesse",
          lang: "pt-BR",
          display: "standalone",
          orientation: "portrait",
          start_url: base,
          scope: base,
          theme_color: treino ? "#c2410c" : "#1f56d1",
          background_color: "#eef5ff",
          icons: [
            { src: `icons/icon-192${sufixo}.png`, sizes: "192x192", type: "image/png", purpose: "any" },
            { src: `icons/icon-512${sufixo}.png`, sizes: "512x512", type: "image/png", purpose: "any" },
            { src: `icons/icon-maskable-192${sufixo}.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: `icons/icon-maskable-512${sufixo}.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: { navigateFallback: "index.html", globPatterns: ["**/*.{js,css,html,png,svg}"] },
      }),
    ],
    test: { include: ["src/**/*.test.{ts,tsx}"] },
  };
});
