import { useState } from "react";
import { DDI_PADRAO, formatarTelefone, linkWhatsApp, validarTelefoneBR } from "../lib/whatsapp";

/** Pergunta o celular do cliente e abre o WhatsApp com a mensagem pronta. O número não é guardado. */
export default function EnviarWhatsApp({ mensagem, titulo = "Enviar por WhatsApp", aoFechar }: {
  mensagem: string; titulo?: string; aoFechar: () => void;
}) {
  const [telefone, setTelefone] = useState("");
  const numero = validarTelefoneBR(telefone);
  const erro = telefone.replace(/\D/g, "").length >= 11 && !numero ? "Número inválido. Use DDD + celular com 9 dígitos." : "";
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" role="dialog" aria-label={titulo}>
      <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5">
        <h2 className="text-xl font-extrabold text-marca-900">{titulo}</h2>
        <label className="block text-sm font-semibold">Celular do cliente (com DDD)
          <div className="mt-1 flex items-stretch gap-2">
            <span className="flex items-center rounded-lg bg-marca-100 px-3 text-lg font-bold text-marca-700">+{DDI_PADRAO}</span>
            <input aria-label="Celular do cliente" inputMode="tel" autoComplete="off" placeholder="(11) 91234-5678"
              value={telefone} onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              className="w-full rounded-lg border-2 border-marca-200 px-3 py-3 text-xl font-bold outline-none focus:border-marca-600" />
          </div>
        </label>
        {erro && <p role="alert" className="font-semibold text-red-600">{erro}</p>}
        <p className="text-xs text-slate-500">O número é usado só para abrir o WhatsApp; não fica guardado no sistema.</p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={aoFechar} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Fechar</button>
          {numero ? (
            <a href={linkWhatsApp(numero, mensagem)} target="_blank" rel="noopener noreferrer"
              className="rounded-xl bg-green-600 py-4 text-center text-lg font-extrabold text-white">Abrir WhatsApp</a>
          ) : (
            <span aria-disabled="true" className="rounded-xl bg-slate-300 py-4 text-center text-lg font-extrabold text-white">Abrir WhatsApp</span>
          )}
        </div>
      </div>
    </div>
  );
}
