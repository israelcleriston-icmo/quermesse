// Turno do caixa: abrir (com fundo de troco), registrar sangrias e fechar SEM ver o valor esperado.
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { lerReais } from "../lib/pagamento";
import { brl } from "../lib/dinheiro";
import { abrirTurno, carregarTurnoAberto, fecharTurno, registrarSangria, type TurnoAberto } from "../lib/turno";
import { carregarEventosAtivos, type EventoAtivo } from "../lib/vendas";
import { useAuth } from "../store/auth";

const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function Turno() {
  const { usuario } = useAuth();
  const [turno, setTurno] = useState<TurnoAberto | null | undefined>(undefined);
  const [eventos, setEventos] = useState<EventoAtivo[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [fundoTxt, setFundoTxt] = useState("");
  const [sangriaAberta, setSangriaAberta] = useState(false);
  const [sangTxt, setSangTxt] = useState("");
  const [motivo, setMotivo] = useState("");
  const [fechando, setFechando] = useState(false);
  const [contadoTxt, setContadoTxt] = useState("");
  const [obs, setObs] = useState("");
  const [encerrado, setEncerrado] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const uid = usuario?.id ?? "";

  const carregar = useCallback(async () => {
    if (!uid) return;
    try {
      const t = await carregarTurnoAberto(uid);
      setTurno(t);
      if (!t) {
        const ev = await carregarEventosAtivos();
        setEventos(ev);
        setEventoId((atual) => atual || ev[0]?.id || "");
      }
      setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); setTurno((t) => t ?? null); }
  }, [uid]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (usuario.papel !== "caixa" && usuario.papel !== "secretaria") return <Navigate to="/" replace />;

  async function agir(fn: () => Promise<void>, depois: () => void) {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try { await fn(); depois(); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro."); }
    finally { setOcupado(false); }
  }

  const abrir = () => {
    const fundo = lerReais(fundoTxt);
    if (fundo === null) return setErro("Valor do fundo inválido. Exemplo: 50,00");
    if (!eventoId) return setErro("Escolha o evento.");
    void agir(() => abrirTurno(eventoId, fundo), () => setFundoTxt(""));
  };
  const sangrar = () => {
    const v = lerReais(sangTxt);
    if (!v) return setErro("Digite o valor retirado da gaveta. Exemplo: 100,00");
    void agir(() => registrarSangria(turno!.id, v, motivo), () => { setSangriaAberta(false); setSangTxt(""); setMotivo(""); });
  };
  const fechar = () => {
    const c = lerReais(contadoTxt);
    if (c === null || contadoTxt.trim() === "") return setErro("Digite quanto você contou na gaveta. Exemplo: 235,50");
    void agir(() => fecharTurno(turno!.id, c, obs), () => { setFechando(false); setEncerrado(true); });
  };

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Meu turno de caixa</h1>
      </header>
      {erro && !sangriaAberta && !fechando && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      {turno === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}

      {encerrado && !turno && (
        <p role="status" className="rounded-2xl bg-green-100 p-6 text-center text-lg font-bold text-green-800">
          Turno fechado ✓<br /><span className="text-base font-medium">Obrigado! O Conselho vai conferir o caixa.</span>
        </p>
      )}

      {turno === null && !encerrado && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow">
          <h2 className="text-lg font-extrabold text-marca-900">Abrir turno</h2>
          {eventos.length === 0 && <p className="rounded-lg bg-amber-100 p-3 font-semibold text-amber-900">Nenhum evento aberto hoje.</p>}
          {eventos.length > 1 && (
            <label className="block text-sm font-semibold">Evento
              <select aria-label="Evento" value={eventoId} onChange={(e) => setEventoId(e.target.value)} className={campo}>
                {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </label>
          )}
          {eventos.length === 1 && <p className="font-semibold text-marca-700">{eventos[0].nome}</p>}
          <label className="block text-sm font-semibold">Fundo de troco: dinheiro que já está na gaveta (R$)
            <input aria-label="Fundo de troco" inputMode="decimal" placeholder="0,00" value={fundoTxt} onChange={(e) => setFundoTxt(e.target.value)} className={campo} />
          </label>
          <button onClick={abrir} disabled={ocupado || eventos.length === 0} className="w-full rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Abrir turno</button>
        </section>
      )}

      {turno && (
        <>
          <section className="rounded-2xl bg-marca-600 p-4 text-white shadow">
            <p className="text-sm opacity-80">Turno aberto às {hora(turno.abertoEm)}</p>
            <p className="text-lg font-extrabold">Fundo de troco: {brl(turno.fundoCentavos)}</p>
          </section>

          <section className="space-y-2 rounded-2xl bg-white p-4 shadow">
            <h2 className="text-lg font-extrabold text-marca-900">Sangrias</h2>
            {turno.sangrias.length === 0 && <p className="text-slate-600">Nenhuma sangria neste turno.</p>}
            <ul className="divide-y divide-marca-100">
              {turno.sangrias.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>{hora(s.registrada_em)} · {brl(Math.round(s.valor * 100))}{s.motivo ? ` · ${s.motivo}` : ""}</span>
                  <span className={`text-xs font-bold ${s.confirmada ? "text-green-700" : "text-amber-700"}`}>{s.confirmada ? "Conselho confirmou" : "Aguardando confirmação"}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-600">Sangria é o dinheiro que você tira da gaveta para entregar ao Conselho. Registre antes de entregar.</p>
            <button onClick={() => { setErro(""); setSangriaAberta(true); }} className="w-full rounded-xl bg-marca-100 py-3 text-lg font-extrabold text-marca-700">+ Registrar sangria</button>
          </section>

          <button onClick={() => { setErro(""); setFechando(true); }} className="rounded-xl bg-amber-600 py-4 text-lg font-extrabold text-white">Fechar turno</button>
        </>
      )}

      {sangriaAberta && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h2 className="text-xl font-extrabold text-marca-900">Registrar sangria</h2>
            <label className="block text-sm font-semibold">Valor retirado da gaveta (R$)
              <input aria-label="Valor da sangria" inputMode="decimal" placeholder="0,00" value={sangTxt} onChange={(e) => setSangTxt(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm font-semibold">Observação (opcional)
              <input aria-label="Observação da sangria" maxLength={100} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Ex.: entregue ao Sr. João" />
            </label>
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setSangriaAberta(false)} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Cancelar</button>
              <button onClick={sangrar} disabled={ocupado} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Registrar</button>
            </div>
          </div>
        </div>
      )}

      {fechando && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60">
          <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h2 className="text-xl font-extrabold text-marca-900">Fechar turno</h2>
            <p className="text-slate-700">Conte o dinheiro que está na gaveta agora, incluindo o fundo de troco, e digite o total. O sistema não mostra quanto deveria ter: a conferência é feita pelo Conselho.</p>
            <label className="block text-sm font-semibold">Total contado na gaveta (R$)
              <input aria-label="Total contado" inputMode="decimal" placeholder="0,00" value={contadoTxt} onChange={(e) => setContadoTxt(e.target.value)} className={campo} />
            </label>
            <label className="block text-sm font-semibold">Observação (opcional)
              <input aria-label="Observação do fechamento" maxLength={200} value={obs} onChange={(e) => setObs(e.target.value)} className={campo} />
            </label>
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setFechando(false)} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Voltar</button>
              <button onClick={fechar} disabled={ocupado} className="rounded-xl bg-amber-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Fechar turno</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
