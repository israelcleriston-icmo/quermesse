// Relatório do evento para o Conselho: números líquidos, CSV para o Excel e PDF (impressão).
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import { baixarCsv, carregarRelatorio, ROTULO_FORMA, type Relatorio } from "../lib/relatorio";
import { escolherEventoPadrao, lembrarEvento, rotuloEvento, type EventoSel } from "../lib/eventoPadrao";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

type Ev = EventoSel;
const c = (v: number) => brl(Math.round(Number(v) * 100));
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid rounded-2xl bg-white p-4 shadow print:rounded-none print:shadow-none"><h2 className="mb-2 text-lg font-extrabold text-marca-900">{titulo}</h2>{children}</section>;
}
function Linha({ a, b, forte = false }: { a: React.ReactNode; b: React.ReactNode; forte?: boolean }) {
  return <div className={`flex justify-between gap-3 py-1 ${forte ? "font-extrabold" : ""}`}><span>{a}</span><span className="text-right">{b}</span></div>;
}

export default function Relatorios() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [rel, setRel] = useState<Relatorio | undefined>(undefined);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const r = await supabase.from("eventos").select("id, nome, data_inicio, data_fim, status").order("data_inicio", { ascending: false });
      if (!vivo) return;
      if (r.error) return setErro("Não foi possível carregar os eventos.");
      const lista = (r.data ?? []) as EventoSel[];
      setEventos(lista);
      setEventoId(escolherEventoPadrao(lista));
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!eventoId) return;
    let vivo = true;
    setRel(undefined);
    carregarRelatorio(eventoId).then((r) => { if (vivo) { setRel(r); setErro(""); } }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : "Erro."); });
    return () => { vivo = false; };
  }, [eventoId]);

  useEffect(() => { if (eventoId) lembrarEvento(eventoId); }, [eventoId]);

  if (!usuario) return null;
  if (usuario.papel !== "conselho" && usuario.papel !== "admin") return <Navigate to="/" replace />;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 print:max-w-none print:p-0">
      <header className="flex items-center justify-between print:hidden">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Relatórios</h1>
      </header>
      <select aria-label="Evento" value={eventoId} onChange={(e) => setEventoId(e.target.value)}
        className="w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600 print:hidden">
        {eventos.map((e) => <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>)}
      </select>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      {rel === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}
      {rel && (
        <>
          <div className="grid grid-cols-2 gap-3 print:hidden">
            <button onClick={() => baixarCsv(rel)} className="rounded-xl bg-green-600 py-3 font-extrabold text-white">⬇ Baixar para Excel (CSV)</button>
            <button onClick={() => window.print()} className="rounded-xl bg-marca-600 py-3 font-extrabold text-white">🖨 Salvar em PDF / imprimir</button>
          </div>
          <div className="hidden print:block">
            <h1 className="text-2xl font-extrabold">Relatório: {rel.evento.nome}</h1>
            <p className="text-sm">Gerado em {new Date(rel.gerado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
          </div>

          {(rel.turnos.abertos > 0 || rel.turnos.sem_conferir > 0 || rel.sangrias.pendentes > 0) && (
            <p role="status" className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-900">
              Atenção: {rel.turnos.abertos > 0 && `${rel.turnos.abertos} turno(s) ainda aberto(s). `}{rel.turnos.sem_conferir > 0 && `${rel.turnos.sem_conferir} turno(s) fechado(s) sem conferência. `}{rel.sangrias.pendentes > 0 && `Sangrias não confirmadas: ${c(rel.sangrias.pendentes)}.`}
            </p>
          )}

          <Bloco titulo="Resumo (líquido)">
            <Linha a="Vendas válidas" b={rel.resumo.vendas} />
            <Linha a="Vendas anuladas / parcialmente anuladas" b={`${rel.resumo.anuladas} / ${rel.resumo.parciais}`} />
            <Linha a="Cortesias" b={rel.resumo.cortesias} />
            <Linha a="Total vendido (bruto)" b={c(rel.resumo.bruto)} />
            <Linha a="Total devolvido" b={`− ${c(rel.resumo.devolvido)}`} />
            <Linha forte a="Total líquido" b={c(rel.resumo.liquido)} />
          </Bloco>

          <Bloco titulo="Por forma de pagamento">
            {rel.por_forma.length === 0 && <p className="text-slate-600">Sem vendas.</p>}
            {rel.por_forma.map((f) => <Linha key={f.forma} a={<>{ROTULO_FORMA[f.forma] ?? f.forma}{f.devolvido > 0 && <span className="text-xs text-slate-500"> (devolvido {c(f.devolvido)})</span>}</>} b={c(f.liquido)} />)}
          </Bloco>

          <Bloco titulo="Por produto">
            {rel.por_produto.length === 0 && <p className="text-slate-600">Sem vendas.</p>}
            {rel.por_produto.map((p) => <Linha key={p.nome} a={`${p.quantidade}× ${p.nome}`} b={c(p.faturamento)} />)}
          </Bloco>

          <Bloco titulo="Por caixa">
            {rel.por_caixa.map((x) => <Linha key={x.caixa} a={`${x.caixa} · ${x.vendas} venda${x.vendas === 1 ? "" : "s"}`} b={c(x.liquido)} />)}
            {rel.por_caixa.length === 0 && <p className="text-slate-600">Sem vendas.</p>}
          </Bloco>

          <Bloco titulo="Por dia">
            {rel.por_dia.map((d) => <Linha key={d.dia} a={`${dataBR(d.dia)} · ${d.vendas} venda${d.vendas === 1 ? "" : "s"}`} b={c(d.liquido)} />)}
            {rel.por_dia.length === 0 && <p className="text-slate-600">Sem vendas.</p>}
          </Bloco>

          <Bloco titulo="Caixa físico">
            <Linha a="Sangrias registradas" b={c(rel.sangrias.total)} />
            <Linha a="Sangrias ainda não confirmadas" b={c(rel.sangrias.pendentes)} />
            <Linha a="Turnos (abertos / sem conferência)" b={`${rel.turnos.total} (${rel.turnos.abertos} / ${rel.turnos.sem_conferir})`} />
            <p className="mt-1 text-sm text-slate-600 print:hidden">A diferença de cada caixa está em <Link to="/conferencia" className="font-semibold text-marca-700 underline">Conferência dos caixas</Link>.</p>
          </Bloco>

          <Bloco titulo="Anulações">
            {rel.anulacoes.length === 0 && <p className="text-slate-600">Nenhuma anulação.</p>}
            <ul className="divide-y divide-marca-100 text-sm">
              {rel.anulacoes.map((a, i) => <li key={i} className="py-2"><Linha a={`Venda nº ${a.numero} · ${a.por}`} b={c(a.valor)} /><span className="text-slate-600">{a.motivo}</span></li>)}
            </ul>
          </Bloco>
        </>
      )}
    </main>
  );
}
