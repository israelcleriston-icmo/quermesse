// Fura-fila — página PÚBLICA (sem login). O cliente monta o pedido e mostra o QR ao caixa.
// Não vende nada e não grava nada: quem cobra e dá baixa no estoque é o caixa.
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Logo from "../components/Logo";
import { brl } from "../lib/dinheiro";
import { urlImagem } from "../lib/imagens";
import { MAX_LINHAS, MAX_QTD, codificarPedido } from "../lib/pedido";
import { supabase } from "../lib/supabase";
import { AMBIENTE } from "../lib/ambiente";

interface Item { seq: number; id: string; nome: string; categoria: string | null; valorCentavos: number; imagemUrl: string | null; esgotado: boolean }
interface Cardapio { evento: { id: string; codigo: string; nome: string }; itens: Item[] }

async function carregar(eventoId: string | null): Promise<Cardapio | null> {
  const { data, error } = await supabase.rpc("cardapio_publico", eventoId ? { p_evento_id: eventoId } : {});
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as { evento: Cardapio["evento"]; itens: { seq: number; id: string; nome: string; categoria: string | null; valor: number | string; imagem_path: string | null; esgotado: boolean }[] };
  return {
    evento: d.evento,
    itens: d.itens.map((i) => ({
      seq: i.seq, id: i.id, nome: i.nome, categoria: i.categoria, valorCentavos: Math.round(Number(i.valor) * 100),
      imagemUrl: urlImagem(i.imagem_path), esgotado: i.esgotado,
    })),
  };
}

export default function CardapioPublico() {
  const [params] = useSearchParams();
  const eventoId = params.get("e");
  const [cardapio, setCardapio] = useState<Cardapio | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  const [qtds, setQtds] = useState<Record<number, number>>({});
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [revisando, setRevisando] = useState(false);
  const [qr, setQr] = useState<{ imagem: string; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    carregar(eventoId).then((c) => { if (vivo) setCardapio(c); }).catch(() => { if (vivo) setErro("Não foi possível carregar o cardápio. Verifique a conexão."); });
    return () => { vivo = false; };
  }, [eventoId]);

  const itens = useMemo(() => cardapio?.itens ?? [], [cardapio]);
  const categorias = useMemo(() => ["Todas", ...Array.from(new Set(itens.map((i) => i.categoria ?? "Outros")))], [itens]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (categoria === "Todas" || (i.categoria ?? "Outros") === categoria) && i.nome.toLowerCase().includes(q));
  }, [itens, busca, categoria]);
  const escolhidos = itens.filter((i) => (qtds[i.seq] ?? 0) > 0);
  const totalItens = escolhidos.reduce((s, i) => s + qtds[i.seq], 0);
  const total = escolhidos.reduce((s, i) => s + qtds[i.seq] * i.valorCentavos, 0);

  const mudar = (seq: number, delta: number) =>
    setQtds((a) => {
      const n = Math.max(0, Math.min(MAX_QTD, (a[seq] ?? 0) + delta));
      if (delta > 0 && (a[seq] ?? 0) === 0 && Object.values(a).filter((v) => v > 0).length >= MAX_LINHAS) return a;
      const { [seq]: _, ...resto } = a;
      return n > 0 ? { ...resto, [seq]: n } : resto;
    });

  async function gerarQr() {
    if (!cardapio || escolhidos.length === 0) return;
    const texto = codificarPedido(cardapio.evento.codigo, escolhidos.map((i) => ({ seq: i.seq, q: qtds[i.seq] })));
    const imagem = await QRCode.toDataURL(texto, { errorCorrectionLevel: "M", margin: 3, width: 360 });
    setQr({ imagem, texto });
  }

  if (qr && cardapio) {
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <div className="rounded-2xl bg-white p-4 text-center shadow">
          <p className="font-extrabold text-marca-900">Seu pedido · {cardapio.evento.nome}</p>
          <img src={qr.imagem} alt="QR Code do pedido" className="mx-auto my-2 w-full max-w-[320px]" />
          <p className="text-lg font-bold text-marca-700">Mostre este QR ao caixa</p>
          <p className="mt-1 text-sm text-slate-600">O pagamento é feito no caixa. Os preços e a disponibilidade são confirmados lá.</p>
        </div>
        <ul className="rounded-2xl bg-white p-3 shadow">
          {escolhidos.map((i) => <li key={i.seq} className="flex justify-between py-1"><span>{qtds[i.seq]}× {i.nome}</span><span className="font-semibold">{brl(i.valorCentavos * qtds[i.seq])}</span></li>)}
          <li className="mt-1 flex justify-between border-t pt-2 text-lg font-extrabold"><span>Total (referência)</span><span>{brl(total)}</span></li>
        </ul>
        <button onClick={() => setQr(null)} className="rounded-xl bg-marca-600 py-4 text-lg font-extrabold text-white">← Alterar pedido</button>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col pb-28">
      <header className={`sticky ${AMBIENTE === "prod" ? "top-0" : "top-6"} z-30 bg-marca-600 p-3 text-white shadow`}>
        <div className="mb-2 flex items-center justify-center gap-2">
          <Logo tamanho={32} />
          <p className="truncate text-sm font-bold">{cardapio?.evento.nome ?? "Cardápio"}</p>
        </div>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto" className="w-full rounded-xl bg-white px-4 py-3 text-marca-900 outline-none" />
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {categorias.map((c) => (
            <button key={c} onClick={() => setCategoria(c)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${c === categoria ? "bg-white text-marca-700" : "bg-marca-700 text-white"}`}>{c}</button>
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-3 p-3">
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        {cardapio === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}
        {cardapio === null && <p className="rounded-xl bg-white p-6 text-center font-semibold">Nenhum evento aberto no momento.</p>}
        {cardapio && <p className="rounded-xl bg-marca-100 p-3 text-center text-sm font-semibold text-marca-700">Monte o seu pedido, mostre o QR no caixa e pague lá. Sem fila para escolher.</p>}
        <ul className="flex flex-col gap-3">
          {visiveis.map((i) => {
            const q = qtds[i.seq] ?? 0;
            return (
              <li key={i.seq} className={`flex min-h-28 items-center gap-3 rounded-2xl bg-white p-3 shadow ${i.esgotado ? "opacity-50" : ""}`}>
                {i.imagemUrl
                  ? <img src={i.imagemUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                  : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-marca-100 text-3xl font-extrabold text-marca-600">{i.nome[0]}</div>}
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight text-marca-900">{i.nome}</p>
                  <p className="mt-1 text-lg font-extrabold text-marca-600">{brl(i.valorCentavos)}</p>
                </div>
                {i.esgotado ? <span className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-bold text-white">ESGOTADO</span>
                  : q > 0 ? (
                    <div className="flex items-center gap-2">
                      <button aria-label={`Menos ${i.nome}`} onClick={() => mudar(i.seq, -1)} className="h-12 w-12 rounded-full bg-marca-100 text-2xl font-bold text-marca-700">−</button>
                      <span className="w-6 text-center text-xl font-extrabold">{q}</span>
                      <button aria-label={`Mais ${i.nome}`} onClick={() => mudar(i.seq, 1)} className="h-12 w-12 rounded-full bg-marca-600 text-2xl font-bold text-white">+</button>
                    </div>
                  ) : <button aria-label={`Adicionar ${i.nome}`} onClick={() => mudar(i.seq, 1)} className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-600 text-2xl font-bold text-white">+</button>}
              </li>
            );
          })}
        </ul>
      </main>

      {totalItens > 0 && (
        <button onClick={() => setRevisando(true)} className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md rounded-2xl bg-marca-700 py-4 text-lg font-extrabold text-white shadow-xl active:bg-marca-900">
          Ver meu pedido · {totalItens} {totalItens === 1 ? "item" : "itens"} · {brl(total)}
        </button>
      )}

      {revisando && (
        <div className="fixed inset-0 z-40 flex h-[100dvh] flex-col justify-end bg-black/60">
          <div className="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h2 className="mb-2 text-xl font-extrabold text-marca-900">Meu pedido</h2>
            <ul className="flex-1 divide-y divide-marca-100 overflow-y-auto">
              {escolhidos.map((i) => (
                <li key={i.seq} className="flex items-center gap-2 py-2">
                  <span className="flex-1 font-semibold">{i.nome}</span>
                  <button aria-label={`Tirar ${i.nome}`} onClick={() => mudar(i.seq, -1)} className="h-11 w-11 rounded-full bg-marca-100 text-xl font-bold text-marca-700">−</button>
                  <span className="w-6 text-center font-bold">{qtds[i.seq]}</span>
                  <button aria-label={`Colocar ${i.nome}`} onClick={() => mudar(i.seq, 1)} className="h-11 w-11 rounded-full bg-marca-600 text-xl font-bold text-white">+</button>
                  <span className="w-24 text-right font-bold">{brl(i.valorCentavos * qtds[i.seq])}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex justify-between text-2xl font-extrabold text-marca-900"><span>Total</span><span>{brl(total)}</span></p>
            <button onClick={() => { setRevisando(false); void gerarQr(); }} disabled={escolhidos.length === 0} className="mt-4 rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Gerar QR do pedido</button>
            <button onClick={() => setRevisando(false)} className="py-3 font-semibold text-marca-700">Voltar ao cardápio</button>
          </div>
        </div>
      )}
    </div>
  );
}
