import { useState } from "react";
import { useInstalar } from "../lib/instalar";

/** Botão "Instalar o app" (Android) ou dica de como adicionar à tela inicial (iPhone). Some quando já instalado. */
export default function InstalarApp() {
  const { situacao, instalar } = useInstalar();
  const [dica, setDica] = useState(false);
  if (situacao === "instalado" || situacao === "nenhuma") return null;
  if (situacao === "botao") {
    return (
      <button onClick={() => void instalar()} className="rounded-xl bg-white py-4 text-lg font-bold text-marca-700 shadow active:bg-marca-100">
        📲 Instalar o app no celular
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-white p-4 shadow">
      <button onClick={() => setDica(!dica)} aria-expanded={dica} className="w-full text-lg font-bold text-marca-700">📲 Adicionar à tela inicial</button>
      {dica && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>No Safari, toque no botão <b>Compartilhar</b> (quadrado com seta para cima).</li>
          <li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li>
          <li>Toque em <b>Adicionar</b>. O ícone do Quermesse aparece na tela.</li>
        </ol>
      )}
    </div>
  );
}
