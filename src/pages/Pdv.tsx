import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import { carregarCardapio, carregarEventoAtivo, finalizarVenda, type EventoAtivo, type ItemCardapio } from "../lib/vendas";
import { totalCentavos, totalItens, useSacola } from "../store/sacola";
import { useAuth } from "../store/auth";

const LIMITE_ALERTA = 20;

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); };
  }, []);
  return on;
}

function Cartao({ item }: { item: ItemCardapio }) {
  const { linhas, adicionar, diminuir } = useSacola();
  const qtd = linhas[item.id]?.qtd ?? 0;
  const esgotado = item.estoque !== null && item.estoque <= 0;
  const mais = () => adicionar({ id: item.id, nome: item.nome, valorCentavos: item.valorCentavos, max: item.estoque });
  return (
    <li
      onClick={esgotado ? undefined : mais}
      className={`relative flex min-h-28 items-center gap-3 rounded-2xl bg-white p-3 shadow ${esgotado ? "opacity-50" : "active:bg-marca-50"}`}
    >
      {item.imagemUrl ? (
        <img src={item.imagemUrl} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-marca-100 text-3xl font-extrabold text-marca-600">
          {item.nome[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight text-marca-900">{item.nome}</p>
        <p className="mt-1 text-lg font-extrabold text-marca-600">{brl(item.valorCentavos)}</p>
        {item.estoque !== null && item.estoque > 0 && item.estoque <= LIMITE_ALERTA && (
          <p className="text-sm font-semibold text-red-600">Apenas {item.estoque}</p>
        )}
      </div>
      {esgotado ? (
        <span className="rounded-lg bg-slate-700 px-2 py-1 text-xs font-bold text-white">ESGOTADO</span>
      ) : qtd > 0 ? (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button aria-label="Menos" onClick={() => diminuir(item.id)} className="h-12 w-12 rounded-full bg-marca-100 text-2xl font-bold text-marca-700 active:bg-marca-200">−</button>
          <span className="w-6 text-center text-xl font-extrabold">{qtd}</span>
          <button aria-label="Mais" onClick={mais} className="h-12 w-12 rounded-full bg-marca-600 text-2xl font-bold text-white active:bg-marca-700">+</button>
        </div>
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-600 text-2xl font-bold text-white">+</span>
      )}
    </li>
  );
}

function Folha({ evento, aoFechar, aoConcluir }: {
  evento: EventoAtivo; aoFechar: () => void;
  aoConcluir: (c: { numero: number; total: number; resumo: string[] }) => void;
}) {
  const { linhas, vendaId, adicionar, diminuir, limpar } = useSacola();
  const online = useOnline();
  const [forma, setForma] = useState<"dinheiro" | "cartao" | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const lista = Object.values(linhas);
  const total = totalCentavos(linhas);

  async function finalizar() {
    if (enviando || !forma || !vendaId) return;      // sem duplo toque
    setEnviando(true);
    setErro("");
    try {
      const r = await finalizarVenda({
        vendaId, eventoId: evento.id, forma, itens: lista.map((l) => ({ ep: l.id, q: l.qtd })),
      });
      const resumo = lista.map((l) => `${l.qtd}× ${l.nome}`);
      limpar();
      aoConcluir({ numero: r.numero, total, resumo });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao finalizar.");
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60">
      <div className="mx-auto flex max-h-[90%] w-full max-w-md flex-col rounded-t-3xl bg-white p-5">
        <h2 className="mb-3 text-xl font-extrabold text-marca-900">Sacola</h2>
        <ul className="flex-1 divide-y divide-marca-100 overflow-y-auto">
          {lista.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 font-semibold">{l.nome}</span>
              <button disabled={!!forma} onClick={() => diminuir(l.id)} className="h-10 w-10 rounded-full bg-marca-100 text-xl font-bold text-marca-700 disabled:opacity-40">−</button>
              <span className="w-6 text-center font-bold">{l.qtd}</span>
              <button disabled={!!forma} onClick={() => adicionar({ id: l.id, nome: l.nome, valorCentavos: l.valorCentavos, max: l.max })} className="h-10 w-10 rounded-full bg-marca-600 text-xl font-bold text-white disabled:opacity-40">+</button>
              <span className="w-24 text-right font-bold">{brl(l.valorCentavos * l.qtd)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between text-2xl font-extrabold text-marca-900"><span>Total</span><span>{brl(total)}</span></p>
        {!online && <p className="mt-2 rounded-lg bg-amber-100 p-2 text-center font-semibold text-amber-800">Sem conexão: aguarde para finalizar.</p>}
        {erro && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        {!forma ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setForma("dinheiro")} className="rounded-xl bg-marca-600 py-4 text-lg font-bold text-white active:bg-marca-700">Dinheiro</button>
            <button onClick={() => setForma("cartao")} className="rounded-xl bg-marca-600 py-4 text-lg font-bold text-white active:bg-marca-700">Cartão</button>
            <button disabled className="col-span-2 rounded-xl bg-slate-200 py-4 text-lg font-bold text-slate-500">Pix (próxima etapa)</button>
            <button onClick={aoFechar} className="col-span-2 py-2 font-semibold text-marca-700">Voltar ao cardápio</button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <p className="col-span-2 text-center font-semibold text-marca-900">{forma === "dinheiro" ? "Dinheiro" : "Cartão"} · {brl(total)}</p>
            <button onClick={() => { setForma(null); setErro(""); }} disabled={enviando} className="rounded-xl bg-red-600 py-5 text-lg font-extrabold text-white active:bg-red-700 disabled:opacity-40">Cancelar</button>
            <button onClick={finalizar} disabled={enviando || !online} className="rounded-xl bg-green-600 py-5 text-lg font-extrabold text-white active:bg-green-700 disabled:bg-slate-300">
              {enviando ? "Enviando…" : "Finalizar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Pdv() {
  const { usuario } = useAuth();
  const { linhas } = useSacola();
  const [evento, setEvento] = useState<EventoAtivo | null | undefined>(undefined);
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [aberta, setAberta] = useState(false);
  const [concluida, setConcluida] = useState<{ numero: number; total: number; resumo: string[] } | null>(null);

  const atualizar = useCallback(async () => {
    try {
      const ev = await carregarEventoAtivo();
      setEvento(ev);
      setItens(ev ? await carregarCardapio(ev.id) : []);
      setErro("");
    } catch {
      setErro("Não foi possível carregar o cardápio. Verifique a conexão.");
    }
  }, []);
  useEffect(() => { void atualizar(); }, [atualizar]);

  const categorias = useMemo(() => ["Todas", ...Array.from(new Set(itens.map((i) => i.categoria)))], [itens]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) => (categoria === "Todas" || i.categoria === categoria) && i.nome.toLowerCase().includes(q));
  }, [itens, busca, categoria]);

  if (usuario && usuario.papel !== "caixa" && usuario.papel !== "secretaria") return <Navigate to="/" replace />;
  const qtdTotal = totalItens(linhas);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col pb-28">
      <header className="sticky top-6 z-30 bg-marca-600 p-3 text-white shadow">
        <div className="mb-2 flex items-center justify-between">
          <Link to="/" className="font-semibold">← Início</Link>
          <span className="truncate text-sm font-bold">{evento?.nome ?? "Caixa"}</span>
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
        {evento === undefined && !erro && <p className="p-6 text-center text-marca-700">Carregando…</p>}
        {evento === null && <p className="rounded-xl bg-white p-6 text-center font-semibold">Nenhum evento aberto hoje. Peça ao Conselho para abrir o evento.</p>}
        <ul className="flex flex-col gap-3">{visiveis.map((i) => <Cartao key={i.id} item={i} />)}</ul>
      </main>

      {qtdTotal > 0 && evento && (
        <button onClick={() => setAberta(true)} className="fixed inset-x-3 bottom-4 z-30 mx-auto max-w-md rounded-2xl bg-marca-700 py-4 text-lg font-extrabold text-white shadow-xl active:bg-marca-900">
          Ver sacola · {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {brl(totalCentavos(linhas))}
        </button>
      )}

      {aberta && evento && qtdTotal > 0 && (
        <Folha evento={evento} aoFechar={() => setAberta(false)}
          aoConcluir={(c) => { setAberta(false); setConcluida(c); void atualizar(); }} />
      )}
      {aberta && qtdTotal === 0 && <FechaSozinha aoFechar={() => setAberta(false)} />}

      {concluida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-green-700 p-6 text-white">
          <div className="w-full max-w-md text-center">
            <p className="text-lg font-semibold">Venda nº {concluida.numero} registrada · {brl(concluida.total)}</p>
            <p className="mt-6 text-sm font-bold tracking-widest">ENTREGAR</p>
            <ul className="mt-2 space-y-1 text-3xl font-extrabold">{concluida.resumo.map((r) => <li key={r}>{r}</li>)}</ul>
            <button onClick={() => setConcluida(null)} className="mt-10 w-full rounded-2xl bg-white py-5 text-xl font-extrabold text-green-700">Próximo cliente</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FechaSozinha({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => { aoFechar(); }, [aoFechar]);
  return null;
}
