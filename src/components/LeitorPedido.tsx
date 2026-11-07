import { useEffect, useRef, useState } from "react";
import { decodificarPixels, lerQrDeArquivo } from "../lib/lerQr";

/** Lê o QR do pedido do cliente: câmera ao vivo; se não der, foto do QR ou colar o código. */
export default function LeitorPedido({ aoLer, aoFechar, erro, titulo = "Ler pedido do cliente", dica = "Aponte para o QR no celular do cliente." }: { aoLer: (texto: string) => void; aoFechar: () => void; erro?: string; titulo?: string; dica?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const foto = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<"iniciando" | "ok" | "indisponivel">("iniciando");
  const [colar, setColar] = useState(false);
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState("");
  const entregue = useRef(false);
  const aoLerAtual = useRef(aoLer);   // sempre a versão mais recente (a câmera roda num efeito que monta uma vez)
  aoLerAtual.current = aoLer;

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let timer = 0;
    let vivo = true;
    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) return setCamera("indisponivel");
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!vivo) { fluxo.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current;
        if (!v) return;
        v.srcObject = fluxo;
        await v.play().catch(() => undefined);
        setCamera("ok");
        const tela = document.createElement("canvas");
        timer = window.setInterval(() => {
          if (entregue.current || !v.videoWidth) return;
          const f = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
          tela.width = Math.round(v.videoWidth * f);
          tela.height = Math.round(v.videoHeight * f);
          const ctx = tela.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(v, 0, 0, tela.width, tela.height);
          const img = ctx.getImageData(0, 0, tela.width, tela.height);
          const lido = decodificarPixels(img.data, tela.width, tela.height);
          if (lido) { entregue.current = true; aoLerAtual.current(lido); window.setTimeout(() => { entregue.current = false; }, 1500); }
        }, 200);
      } catch {
        if (vivo) setCamera("indisponivel");
      }
    }
    void iniciar();
    return () => { vivo = false; window.clearInterval(timer); fluxo?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function daFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setMsg("");
    try {
      const lido = await lerQrDeArquivo(arquivo);
      if (lido) aoLer(lido); else setMsg("Não encontrei um QR nesta foto.");
    } catch { setMsg("Não foi possível abrir a imagem."); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4 text-white" role="dialog" aria-label={titulo}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3">
        <h2 className="text-center text-xl font-extrabold">{titulo}</h2>
        {camera !== "indisponivel" && <video ref={video} playsInline muted className="aspect-square w-full rounded-2xl bg-black object-cover" />}
        {camera === "iniciando" && <p className="text-center text-sm">Abrindo a câmera…</p>}
        {camera === "ok" && <p className="text-center text-sm">{dica}</p>}
        {camera === "indisponivel" && <p className="rounded-lg bg-amber-100 p-3 text-center text-sm font-semibold text-amber-900">Câmera indisponível (permissão negada ou navegador sem suporte). Use a foto do QR ou cole o código.</p>}
        {(erro || msg) && <p role="alert" className="rounded-lg bg-red-100 p-3 font-semibold text-red-800">{erro || msg}</p>}
        <input ref={foto} type="file" accept="image/*" hidden aria-label="Foto do QR do pedido" onChange={(e) => { void daFoto(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => foto.current?.click()} className="rounded-xl bg-white py-3 font-bold text-marca-700">📷 Foto do QR</button>
          <button onClick={() => setColar(!colar)} className="rounded-xl bg-white py-3 font-bold text-marca-700">Colar código</button>
        </div>
        {colar && (
          <div className="space-y-2">
            <textarea aria-label="Código lido" rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full rounded-lg p-2 font-mono text-sm text-black" placeholder="Cole o código aqui" />
            <button onClick={() => aoLer(texto)} disabled={!texto.trim()} className="w-full rounded-xl bg-green-600 py-3 font-bold disabled:opacity-40">Usar este código</button>
          </div>
        )}
        <button onClick={aoFechar} className="mt-auto rounded-xl bg-slate-200 py-4 text-lg font-bold text-slate-900">Fechar</button>
      </div>
    </div>
  );
}
