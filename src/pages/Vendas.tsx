// Vendas do evento e anulação (total ou parcial) pelo Conselho/admin.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { anularVenda, carregarVendas, disponivelPorForma, ROTULO_FORMA, sugerirEstornos, type VendaLista } from "../lib/anulacao";
import { brl } from "../lib/dinheiro";
import { centavosParaTexto, lerReais } from "../lib/pagamento";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

interface Ev { id: string; nome: string }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";
const ROTULO_STATUS = { finalizada: "Finalizada", parcialmente_anulada: "Parcialmente anulada", anulada: "Anulada" } as const;

function Anular({ venda, aoFechar, aoAnular }: { venda: VendaLista; aoFechar: () => void; aoAnular: () => void }) {
  const restantes = venda.itens.filter((i) => i.quantidade > i.quantidade_anulada);
  const [qtds, setQtds] = useState<Record<string, number>>(() => Object.fromEntries(restantes.map((i) => [i.id, i.quantidade - i.quantidade_anulada])));
  const [motivo, setMotivo] = useState("");
  const [devolver, setDevolver] = useState(true);
  const [estTxt, setEstTxt] = useState<Record<string, string> | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const valorCentavos = restantes.reduce((s, i) => s + (qtds[i.id] ?? 0) * Math.round(i.valor_unitario * 100), 0);
  const disponivel = useMemo(() => disponivelPorForma(venda), [venda]);
  const sugestao = useMemo(() => sugerirEstornos(disponivel, valorCentavos), [disponivel, valorCentavos]);
  const formas = Object.keys(disponivel).filter((f) => disponivel[f] > 0);
  // enquanto a pessoa não mexe nos campos, vale a sugestão
  const estornos: Record<string, number | null> = Object.fromEntries(formas.map((f) => [f, estTxt ? lerReais(estTxt[f] ?? "") : (sugestao[f] ?? 0)]));
  const somaEst = Object.values(estornos).reduce<number>((s, v) => s + (v ?? 0), 0);
  const invalido = Object.values(estornos).some((v) => v === null);

  async function confirmar() {
    if (ocupado) return;
    const itens = restantes.filter((i) => (qtds[i.id] ?? 0) > 0).map((i) => ({ item: i.id, q: qtds[i.id] }));
    if (itens.length === 0) return setErro("Escolha pelo menos um item para anular.");
    if (motivo.trim().length < 5) return setErro("Escreva o motivo da anulação (pelo menos 5 letras).");
    if (invalido) return setErro("Valor de devolução inválido. Exemplo: 8,00");
    if (somaEst !== valorCentavos) return setErro(`A soma das devoluções (${brl(somaEst)}) precisa ser igual ao valor anulado (${brl(valorCentavos)}).`);
    setOcupado(true);
    setErro("");
    try {
      await anularVenda({ vendaId: venda.id, itens, estornosCentavos: Object.fromEntries(Object.entries(estornos).map(([f, v]) => [f, v ?? 0])), motivo, devolverEstoque: devolver });
      aoAnular();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro."); setOcupado(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="mx-auto flex max-h-[92dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-extrabold text-marca-900">Anular venda nº {venda.numero}</h2>
        <ul className="divide-y divide-marca-100">
          {restantes.map((i) => {
            const max = i.quantidade - i.quantidade_anulada;
            return (
              <li key={i.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 font-semibold">{i.nome}</span>
                <button aria-label={`Menos ${i.nome}`} onClick={() => setQtds((q) => ({ ...q, [i.id]: Math.max(0, (q[i.id] ?? 0) - 1) }))} className="h-11 w-11 rounded-full bg-marca-100 text-xl font-bold text-marca-700">−</button>
                <span className="w-12 text-center font-bold">{qtds[i.id] ?? 0}/{max}</span>
                <button aria-label={`Mais ${i.nome}`} onClick={() => setQtds((q) => ({ ...q, [i.id]: Math.min(max, (q[i.id] ?? 0) + 1) }))} className="h-11 w-11 rounded-full bg-marca-600 text-xl font-bold text-white">+</button>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between text-lg font-extrabold"><span>Valor a devolver</span><span>{brl(valorCentavos)}</span></p>
        <fieldset className="space-y-2 rounded-xl bg-marca-50 p-3">
          <legend className="px-1 text-sm font-semibold">Como o dinheiro foi devolvido</legend>
          {formas.map((f) => (
            <label key={f} className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>{ROTULO_FORMA[f] ?? f} <span className="font-normal text-slate-500">(até {brl(disponivel[f])})</span></span>
              <input aria-label={`Devolvido em ${ROTULO_FORMA[f] ?? f}`} inputMode="decimal" className="w-28 rounded-lg border-2 border-marca-200 px-2 py-2 text-right text-lg"
                value={estTxt ? (estTxt[f] ?? "") : centavosParaTexto(sugestao[f] ?? 0)}
                onChange={(e) => setEstTxt({ ...Object.fromEntries(formas.map((x) => [x, centavosParaTexto(sugestao[x] ?? 0)])), ...(estTxt ?? {}), [f]: e.target.value })} />
            </label>
          ))}
          {valorCentavos === 0 && <p className="text-sm text-slate-600">Venda sem valor (cortesia): nada a devolver.</p>}
        </fieldset>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} className="h-5 w-5" />Devolver os itens ao estoque
        </label>
        <label className="block text-sm font-semibold">Motivo da anulação (obrigatório)
          <input aria-label="Motivo da anulação" maxLength={200} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Ex.: cliente desistiu; pedido errado" />
        </label>
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={aoFechar} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Voltar</button>
          <button onClick={() => void confirmar()} disabled={ocupado} className="rounded-xl bg-red-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Confirmar anulação</button>
        </div>
      </div>
    </div>
  );
}

export default function Vendas() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [vendas, setVendas] = useState<VendaLista[] | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [anulando, setAnulando] = useState<VendaLista | null>(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await supabase.from("eventos").select("id, nome").order("data_inicio", { ascending: false });
      if (!vivo) return;
      if (r.error) return setErro("Não foi possível carregar os eventos.");
      const lista = (r.data ?? []) as Ev[];
      setEventos(lista);
      setEventoId(lista[0]?.id ?? "");
      if (lista.length === 0) setVendas([]);
    })();
    return () => { vivo = false; };
  }, []);

  const carregar = useCallback(async () => {
    if (!eventoId) return;
    try { setVendas(await carregarVendas(eventoId)); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro."); setVendas((v) => v ?? []); }
  }, [eventoId]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (usuario.papel !== "conselho" && usuario.papel !== "admin") return <Navigate to="/" replace />;

  const q = busca.trim().replace(/^#/, "");
  const visiveis = (vendas ?? []).filter((v) => q === "" || String(v.numero) === q || v.vendedor.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Vendas e anulações</h1>
      </header>
      <select aria-label="Evento" value={eventoId} onChange={(e) => { setVendas(undefined); setEventoId(e.target.value); }} className={campo}>
        {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
      <input aria-label="Buscar venda" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número da venda ou nome do caixa" className={campo} />
      {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">{aviso}</p>}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      {vendas === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}
      {vendas && visiveis.length === 0 && !erro && <p className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhuma venda encontrada.</p>}
      <ul className="flex flex-col gap-3">
        {visiveis.map((v) => (
          <li key={v.id} className={`space-y-1 rounded-2xl bg-white p-4 shadow ${v.status === "anulada" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-extrabold text-marca-900">Venda nº {v.numero} · {brl(Math.round(v.valor_total * 100))}</p>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${v.status === "finalizada" ? "bg-green-100 text-green-800" : v.status === "anulada" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{ROTULO_STATUS[v.status]}</span>
            </div>
            <p className="text-sm text-slate-600">{hora(v.finalizada_em)} · {v.vendedor} · {v.pagamentos.map((p) => ROTULO_FORMA[p.forma] ?? p.forma).join(" + ") || "Cortesia"}</p>
            <ul className="text-sm">
              {v.itens.map((i) => <li key={i.id}>{i.quantidade}× {i.nome}{i.quantidade_anulada > 0 ? ` (${i.quantidade_anulada} anulado${i.quantidade_anulada > 1 ? "s" : ""})` : ""}</li>)}
            </ul>
            {v.status !== "anulada" && (
              v.vendedorId === usuario.id
                ? <p className="rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">Venda feita por você: outra pessoa do Conselho precisa anular.</p>
                : <button onClick={() => { setErro(""); setAnulando(v); }} className="w-full rounded-xl bg-red-50 py-3 font-extrabold text-red-700 active:bg-red-100">Anular…</button>
            )}
          </li>
        ))}
      </ul>
      {anulando && <Anular venda={anulando} aoFechar={() => setAnulando(null)} aoAnular={() => { setAnulando(null); setAviso("Venda anulada ✓"); setTimeout(() => setAviso(""), 5000); void carregar(); }} />}
    </main>
  );
}
