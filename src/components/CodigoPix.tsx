import { useRef, useState } from "react";
import { lerQrDeArquivo } from "../lib/lerQr";
import LeitorPedido from "./LeitorPedido";
import { lerBrCode, type PixLido } from "../pix/brcode";

/** Cola o "Pix Copia e Cola" ou fotografa o QR do banco e devolve chave, nome e cidade. */
export default function CodigoPix({ aoLer }: { aoLer: (d: PixLido) => void }) {
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [camera, setCamera] = useState(false);
  const foto = useRef<HTMLInputElement>(null);

  function processar(codigo: string) {
    const r = lerBrCode(codigo);
    if (!r.ok) return setMsg({ ok: false, texto: r.erro });
    aoLer(r.dados);
    setMsg({ ok: true, texto: `Dados lidos${r.dados.nome ? `: ${r.dados.nome}${r.dados.cidade ? ` · ${r.dados.cidade}` : ""}` : " (só a chave: nome e cidade ficam no padrão)"}. Confira abaixo.` });
  }

  async function aoEscolherFoto(arquivo: File | undefined) {
    if (!arquivo || lendo) return;
    setLendo(true);
    setMsg(null);
    try {
      const codigo = await lerQrDeArquivo(arquivo);
      if (!codigo) setMsg({ ok: false, texto: "Não consegui ler o QR nesta foto. Tente de novo, bem de frente e sem reflexo, ou cole o código." });
      else processar(codigo);
    } catch {
      setMsg({ ok: false, texto: "Não foi possível abrir a imagem. Tente outra foto ou cole o código." });
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-marca-200 bg-marca-50 p-3">
      <label className="block text-sm font-semibold">Código Pix do banco (copia e cola)
        <textarea aria-label="Código Pix do banco" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Cole aqui o código que começa com 000201…" className="mt-1 w-full rounded-lg border-2 border-marca-200 bg-white p-2 font-mono text-xs outline-none focus:border-marca-600" />
      </label>
      <button type="button" onClick={() => setCamera(true)} className="w-full rounded-lg bg-marca-600 py-3 font-bold text-white">📷 Ler QR com a câmera</button>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => processar(texto)} disabled={!texto.trim()} className="rounded-lg bg-marca-600 py-3 font-bold text-white disabled:opacity-40">Ler dados do código</button>
        <button type="button" onClick={() => foto.current?.click()} disabled={lendo} className="rounded-lg bg-white py-3 font-bold text-marca-700 disabled:opacity-40">{lendo ? "Lendo…" : "📷 Ler QR por foto"}</button>
      </div>
      <input ref={foto} type="file" accept="image/*" hidden aria-label="Foto do QR"
        onChange={(e) => { void aoEscolherFoto(e.target.files?.[0]); e.target.value = ""; }} />
      {camera && (
        <LeitorPedido titulo="Ler QR Pix do banco" dica="Aponte para o QR Pix (na tela de outro aparelho ou impresso)."
          aoFechar={() => setCamera(false)}
          aoLer={(c) => { const r = lerBrCode(c); if (r.ok) { setCamera(false); processar(c); } else setMsg({ ok: false, texto: r.erro }); }} />
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.texto}</p>}
    </div>
  );
}
