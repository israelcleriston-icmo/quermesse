// Conferência dos caixas (Conselho/admin): esperado x contado, sangrias e conferência do turno.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import { lerReais } from "../lib/pagamento";
import { conferenciaDoEvento, conferirTurno, confirmarSangria, gerarCodigoSangria, type CodigoSangria, type TurnoConferencia } from "../lib/turno";
import { escolherEventoPadrao, lembrarEvento, rotuloEvento, type EventoSel } from "../lib/eventoPadrao";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

type Ev = EventoSel;
const c = (v: number) => brl(Math.round(v * 100));
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ROTULO_FORMA: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito" };

function CartaoTurno({ t, aoMudar, aoErro }: { t: TurnoConferencia; aoMudar: () => void; aoErro: (m: string) => void }) {
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function agir(fn: () => Promise<void>, recarregar = true) {
    if (ocupado) return;
    setOcupado(true);
    try { await fn(); if (recarregar) aoMudar(); } catch (e) { aoErro(e instanceof Error ? e.message : "Erro."); }
    finally { setOcupado(false); }
  }
  const [valorCod, setValorCod] = useState("");
  const [cod, setCod] = useState<CodigoSangria | null>(null);
  const [recebida, setRecebida] = useState<number | null>(null);
  const baseConfirmadas = useRef(0);
  const confirmadas = t.sangrias.filter((x) => x.confirmada).length;
  // Com um código na tela, olha o servidor a cada 4 s; se surgir uma sangria confirmada nova, avisa.
  useEffect(() => {
    if (!cod) return;
    const id = setInterval(() => aoMudar(), 4000);
    return () => clearInterval(id);
  }, [cod, aoMudar]);
  useEffect(() => {
    if (cod && confirmadas > baseConfirmadas.current) { setRecebida(cod.valor); setCod(null); setValorCod(""); }
  }, [confirmadas, cod]);
  const gerar = () => {
    const v = lerReais(valorCod);
    if (!v) return aoErro("Digite o valor que o caixa vai entregar. Exemplo: 100,00");
    void agir(async () => { baseConfirmadas.current = confirmadas; setRecebida(null); setCod(await gerarCodigoSangria(t.turno_id, v)); }, false);
  };
  const dif = t.diferenca;
  const corDif = dif === null ? "" : dif === 0 ? "text-green-700" : "text-red-700";
  return (
    <li className="space-y-2 rounded-2xl bg-white p-4 shadow">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-extrabold text-marca-900">{t.caixa}{t.proprio && <span className="font-normal text-slate-500"> (você)</span>}</p>
          <p className="text-sm text-slate-600">{hora(t.aberto_em)} → {t.fechado_em ? hora(t.fechado_em) : "em andamento"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${t.conferido_em ? "bg-green-100 text-green-800" : t.fechado_em ? "bg-amber-100 text-amber-900" : "bg-marca-100 text-marca-700"}`}>
          {t.conferido_em ? "Conferido" : t.fechado_em ? "Aguardando conferência" : "Aberto"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt>Fundo de troco</dt><dd className="text-right font-semibold">{c(t.fundo_inicial)}</dd>
        <dt>Vendas em dinheiro</dt><dd className="text-right font-semibold">{c(t.vendas_dinheiro)}</dd>
        {(t.devolucoes_dinheiro ?? 0) > 0 && (<><dt>Devoluções em dinheiro</dt><dd className="text-right font-semibold">− {c(t.devolucoes_dinheiro ?? 0)}</dd></>)}
        <dt>Sangrias</dt><dd className="text-right font-semibold">− {c(t.sangrias_total)}</dd>
        <dt className="font-bold">Esperado na gaveta</dt><dd className="text-right font-bold">{t.esperado === null ? "—" : c(t.esperado)}</dd>
        <dt className="font-bold">Contado pelo caixa</dt><dd className="text-right font-bold">{t.contado === null ? "—" : c(t.contado)}</dd>
        <dt className="font-bold">Diferença</dt>
        <dd className={`text-right text-lg font-extrabold ${corDif}`}>{dif === null ? "—" : `${dif > 0 ? "+" : ""}${c(dif)}`}{dif !== null && dif < 0 ? " (faltou)" : dif !== null && dif > 0 ? " (sobrou)" : ""}</dd>
      </dl>
      {Object.keys(t.outras_formas).length > 0 && (
        <p className="text-sm text-slate-600">Fora da gaveta: {Object.entries(t.outras_formas).map(([f, v]) => `${ROTULO_FORMA[f] ?? f} ${c(Number(v))}`).join(" · ")}</p>
      )}
      {t.obs_fechamento && <p className="rounded-lg bg-slate-100 p-2 text-sm">Observação do caixa: {t.obs_fechamento}</p>}
      {t.proprio && <p className="rounded-lg bg-amber-100 p-2 text-sm font-semibold text-amber-900">Este é o seu próprio turno: outra pessoa do Conselho precisa conferir.</p>}
      {t.sangrias.length > 0 && (
        <ul className="divide-y divide-marca-100 text-sm">
          {t.sangrias.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span>{hora(s.registrada_em)} · {c(s.valor)}{s.motivo ? ` · ${s.motivo}` : ""}</span>
              {s.confirmada ? <span className="font-bold text-green-700">Confirmada</span>
                : t.proprio ? <span className="font-bold text-amber-700">Pendente</span>
                : <button disabled={ocupado} onClick={() => void agir(() => confirmarSangria(s.id))} className="rounded-lg bg-marca-600 px-3 py-2 font-bold text-white disabled:opacity-40" aria-label={`Confirmar sangria de ${c(s.valor)}`}>Confirmar recebimento</button>}
            </li>
          ))}
        </ul>
      )}
      {!t.fechado_em && !t.proprio && (
        <div className="space-y-2 rounded-xl bg-marca-50 p-3">
          <p className="text-sm font-bold text-marca-900">Receber sangria</p>
          <div className="flex gap-2">
            <input aria-label="Valor da sangria a receber" inputMode="decimal" placeholder="Valor (R$)" value={valorCod} onChange={(e) => { setValorCod(e.target.value); setCod(null); }} className="min-w-0 flex-1 rounded-lg border-2 border-marca-200 px-3 py-2 outline-none focus:border-marca-600" />
            <button disabled={ocupado} onClick={gerar} className="rounded-lg bg-marca-600 px-3 py-2 font-bold text-white disabled:opacity-40">Gerar código</button>
          </div>
          {recebida !== null && (
            <p role="status" className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">Sangria de {c(recebida)} confirmada pelo caixa. Pode receber o dinheiro.</p>
          )}
          {cod && (
            <div role="status" className="rounded-lg bg-white p-3 text-center">
              <p className="text-sm text-slate-600">Passe este código ao caixa (vale 10 minutos, {c(cod.valor)}):</p>
              <p aria-label="Código gerado" className="text-4xl font-extrabold tracking-[0.3em] text-marca-900">{cod.codigo}</p>
              <p className="text-xs text-slate-500">Receba o dinheiro só depois de o caixa digitar o código. Esta tela avisa quando ele confirmar.</p>
            </div>
          )}
        </div>
      )}
      {t.fechado_em && !t.conferido_em && !t.proprio && (
        <div className="space-y-2 border-t pt-2">
          <input aria-label="Observação da conferência" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" className="w-full rounded-lg border-2 border-marca-200 px-3 py-2 outline-none focus:border-marca-600" />
          <button disabled={ocupado} onClick={() => void agir(() => conferirTurno(t.turno_id, obs))} className="w-full rounded-xl bg-green-600 py-3 text-lg font-extrabold text-white disabled:opacity-40">Conferir turno</button>
        </div>
      )}
      {t.conferido_em && t.obs_conferencia && <p className="text-sm text-slate-600">Conferência: {t.obs_conferencia}</p>}
    </li>
  );
}

export default function Conferencia() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Ev[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [turnos, setTurnos] = useState<TurnoConferencia[] | undefined>(undefined);
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
      if (lista.length === 0) setTurnos([]);
    })();
    return () => { vivo = false; };
  }, []);

  const carregar = useCallback(async () => {
    if (!eventoId) return;
    try { setTurnos(await conferenciaDoEvento(eventoId)); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); setTurnos((t) => t ?? []); }
  }, [eventoId]);
  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => { if (eventoId) lembrarEvento(eventoId); }, [eventoId]);

  if (!usuario) return null;
  if (usuario.papel !== "conselho" && usuario.papel !== "admin") return <Navigate to="/" replace />;

  const pendentes = (turnos ?? []).filter((t) => t.fechado_em && !t.conferido_em).length;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Conferência dos caixas</h1>
      </header>
      <label className="block text-sm font-semibold">Evento
        <select aria-label="Evento" value={eventoId} onChange={(e) => { setTurnos(undefined); setEventoId(e.target.value); }}
          className="w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600">
          {eventos.map((e) => <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>)}
        </select>
      </label>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      {turnos === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}
      {turnos && pendentes > 0 && <p role="status" className="rounded-lg bg-amber-100 p-3 text-center font-bold text-amber-900">{pendentes} {pendentes === 1 ? "turno aguardando conferência" : "turnos aguardando conferência"}</p>}
      {turnos && turnos.length === 0 && !erro && <p className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum turno neste evento.</p>}
      <ul className="flex flex-col gap-3">
        {(turnos ?? []).map((t) => <CartaoTurno key={t.turno_id} t={t} aoMudar={() => void carregar()} aoErro={setErro} />)}
      </ul>
    </main>
  );
}
