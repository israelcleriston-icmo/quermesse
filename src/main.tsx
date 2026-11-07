import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import FaixaAmbiente from "./components/FaixaAmbiente";
import "./index.css";
import { AMBIENTE } from "./lib/ambiente";
import { configurado } from "./lib/supabase";

const arquivo = AMBIENTE === "prod" ? ".env.production" : AMBIENTE === "training" ? ".env.training" : ".env.development";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {configurado ? (
      <App />
    ) : (
      <>
        <FaixaAmbiente />
        <main className="mx-auto max-w-md p-6">
          <h1 className="text-xl font-bold text-red-700">Configuração ausente</h1>
          <p className="mt-2">Crie o arquivo <code>{arquivo}</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_KEY</code> (veja <code>.env.example</code>).</p>
        </main>
      </>
    )}
  </StrictMode>,
);
