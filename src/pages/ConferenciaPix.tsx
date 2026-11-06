// Conselho: ver as fotos dos comprovantes Pix, marcar como conferidos e comparar com o extrato do banco (OFX).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import { carregarPix, conciliar, lerArquivoOfx, marcarConferido, urlsComprovantes, type Conciliacao, type ExtratoOfx, type PixPagamento } from "../lib/pixconf";
import { escolherEventoPadrao, lembrarEvento, rotuloEvento, type EventoSel } from "../lib/eventoPadrao";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

type Ev = EventoSel;
const c = (v: number) => brl(Math.round(v * 100));
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";

export default function ConferenciaPix() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [pix, setPix] = useState<PixPagamento[] | undefined>(undefined);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "conferidos">("pendentes");
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [aba, setAba] = useState<"fotos" | "extrato">("fotos");
  const [extrato, setExtrato] = useState<ExtratoOfx | null>(null);
  const [msgExtrato, setMsgExtrato] = useState("");
  const [erro, setErro] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await supabase.from("eventos").select("id, nome, data_inicio, data_fim, status").order("data_inicio", { ascending: false });
      if (!vivo) return;
      if (r.error) return setErro("Não foi possível carregar os eventos.");
      const lista = (r.data ?? []) as EventoSel[];
      setEventos(lista);
      setEventoId(escolherEventoPadrao(lista));
      if (lista.length === 0) setPix([]);
    })();
    return () => { vivo = false; };
  }, []);

  const carregar = useCallback(async () => {
    if (!eventoId) return;
    try {
      const lista = await carregarPix(eventoId);
      setPix(lista);
      setErro("");
      urlsComprovantes(lista.map((p) => p.comprovante).filter((x): x is string => !!x)).then(setUrls).catch(() => setErro("Não foi possível abrir as fotos dos comprovantes."));
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro."); setPix((p) => p ?? []); }
  }, [eventoId]);
  useEffect(() => { setPix(undefined); void carregar(); }, [carregar]);

  const conciliacao: Conciliacao | null = useMemo(() => (extrato && pix ? conciliar(extrato, pix) : null), [extrato, pix]);

  useEffect(() => { if (eventoId) lembrarEvento(eventoId); }, [eventoId]);

  if (!usuario) return null;
  if (usuario.papel !== "conselho" && usuario.papel !== "admin") return <Navigate to="/" replace />;

  async function alternar(p: PixPagamento) {
    try { await marcarConferido(p.id, !p.conferidoEm); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro."); }
  }
  async function aoEscolher(f: File | undefined) {
    if (!f) return;
    setMsgExtrato("");
    try {
      const e = await lerArquivoOfx(f);
      if (e.creditos.length === 0) setMsgExtrato("Não encontrei Pix recebidos neste arquivo. Confira se é o extrato em formato OFX.");
      setExtrato(e);
    } catch { setMsgExtrato("Não foi possível ler o arquivo."); }
  }

  const lista = (pix ?? []).filter((p) => filtro === "todos" || (filtro === "conferidos") === !!p.conferidoEm);
  const total = (pix ?? []).reduce((s, p) => s + p.valor, 0);
  const conferidos = (pix ?? []).filter((p) => p.conferidoEm).length;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Conferir Pix</h1>
      </header>
      <select aria-label="Evento" value={eventoId} onChange={(e) => { setExtrato(null); setEventoId(e.target.value); }} className={campo}>
        {eventos.map((e) => <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        {(["fotos", "extrato"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} className={`rounded-xl py-3 font-extrabold ${aba === a ? "bg-marca-600 text-white" : "bg-marca-100 text-marca-700"}`}>{a === "fotos" ? "Comprovantes" : "Extrato do banco"}</button>
        ))}
      </div>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      {pix === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}

      {pix && aba === "fotos" && (
        <>
          <p className="rounded-xl bg-white p-3 text-center font-semibold shadow">{pix.length} Pix · {c(total)} · conferidos: {conferidos}/{pix.length}</p>
          <select aria-label="Filtro" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className={campo}>
            <option value="pendentes">Ainda não conferidos</option><option value="conferidos">Já conferidos</option><option value="todos">Todos</option>
          </select>
          {lista.length === 0 && !erro && <p className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum Pix nesta lista.</p>}
          <ul className="flex flex-col gap-3">
            {lista.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow">
                {p.comprovante && urls[p.comprovante]
                  ? <button onClick={() => setAmpliada(urls[p.comprovante!])} aria-label={`Ampliar comprovante da venda ${p.vendaNumero}`} className="shrink-0"><img src={urls[p.comprovante]} alt={`Comprovante da venda ${p.vendaNumero}`} className="h-28 w-20 rounded-lg object-cover" /></button>
                  : <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">sem foto</div>}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-lg font-extrabold text-marca-900">{c(p.valor)}</p>
                  <p className="text-sm text-slate-600">Venda nº {p.vendaNumero} · {hora(p.quando)}<br />{p.caixa}</p>
                  {p.vendaStatus !== "finalizada" && <p className="text-xs font-bold text-amber-700">Venda {p.vendaStatus === "anulada" ? "anulada" : "parcialmente anulada"}</p>}
                  {p.vendedorId === usuario.id
                    ? <p className="text-xs font-semibold text-amber-900">Venda sua: outra pessoa confere.</p>
                    : <button onClick={() => void alternar(p)} className={`w-full rounded-lg py-2 font-bold ${p.conferidoEm ? "bg-green-100 text-green-800" : "bg-marca-600 text-white"}`}>{p.conferidoEm ? "✓ Conferido (desmarcar)" : "Marcar como conferido"}</button>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pix && aba === "extrato" && (
        <>
          <p className="rounded-xl bg-white p-3 text-sm text-slate-700 shadow">Baixe o extrato do banco em formato <strong>OFX</strong> e escolha o arquivo aqui. Ele é lido só neste aparelho: nada é enviado nem guardado.
            O sistema casa cada Pix recebido no banco com uma venda de mesmo valor (até 1 dia de diferença).</p>
          <input ref={arquivo} type="file" accept=".ofx,.OFX,text/plain,application/x-ofx" hidden aria-label="Arquivo OFX" onChange={(e) => { void aoEscolher(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => arquivo.current?.click()} className="rounded-xl bg-marca-600 py-3 font-extrabold text-white">Escolher extrato (OFX)</button>
          {msgExtrato && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{msgExtrato}</p>}
          {conciliacao && extrato && (
            <>
              <p role="status" className="rounded-xl bg-white p-3 text-center font-semibold shadow">
                Período do extrato: {extrato.inicio ? dataBR(extrato.inicio) : "—"} a {extrato.fim ? dataBR(extrato.fim) : "—"}<br />
                Casados: {conciliacao.casados.length} · Só no banco: {conciliacao.soBanco.length} · Só no sistema: {conciliacao.soSistema.length}
              </p>
              <section className="rounded-2xl bg-white p-4 shadow">
                <h2 className="mb-1 text-lg font-extrabold text-marca-900">Entrou no banco e não há venda Pix</h2>
                {conciliacao.soBanco.length === 0 && <p className="text-slate-600">Nenhum.</p>}
                <ul className="divide-y divide-marca-100 text-sm">
                  {conciliacao.soBanco.map((b) => <li key={b.id + b.dia} className="flex justify-between gap-2 py-2"><span>{dataBR(b.dia)} · {b.nome || "—"}</span><strong>{c(b.centavos / 100)}</strong></li>)}
                </ul>
                <p className="mt-1 text-xs text-slate-500">Pode ser doação, depósito ou venda não registrada. Confirme com o comprovante.</p>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow">
                <h2 className="mb-1 text-lg font-extrabold text-marca-900">Há venda Pix e não apareceu no banco</h2>
                {conciliacao.soSistema.length === 0 && <p className="text-slate-600">Nenhuma.</p>}
                <ul className="divide-y divide-marca-100 text-sm">
                  {conciliacao.soSistema.map((p) => <li key={p.id} className="flex justify-between gap-2 py-2"><span>Venda nº {p.vendaNumero} · {hora(p.quando)} · {p.caixa}</span><strong>{c(p.valor)}</strong></li>)}
                </ul>
                <p className="mt-1 text-xs text-slate-500">Compare com a foto do comprovante: pode ter sido lançado depois do período do extrato ou ser um comprovante falso.</p>
              </section>
            </>
          )}
        </>
      )}

      {ampliada && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-3" role="dialog" aria-label="Comprovante ampliado">
          <img src={ampliada} alt="Comprovante ampliado" className="mx-auto min-h-0 flex-1 object-contain" />
          <button onClick={() => setAmpliada(null)} className="mt-3 rounded-xl bg-white py-4 text-lg font-extrabold text-marca-700">Fechar</button>
        </div>
      )}
    </main>
  );
}
