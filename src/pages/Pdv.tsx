import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import Folha from "../components/Folha";
import Pagamento, { type Conclusao } from "../components/Pagamento";
import { carregarCardapio, carregarEventosAtivos, type EventoAtivo, type ItemCardapio } from "../lib/vendas";
import { totalCentavos, totalItens, useSacola } from "../store/sacola";
import { AMBIENTE } from "../lib/ambiente";
import { useAuth } from "../store/auth";

const CHAVE_EVENTO = `quermesse-${AMBIENTE}-evento`;
const lerEscolha = () => { try { return sessionStorage.getItem(CHAVE_EVENTO); } catch { return null; } };
const gravarEscolha = (id: string) => { try { sessionStorage.setItem(CHAVE_EVENTO, id); } catch { /* sem armazenamento */ } };

const LIMITE_ALERTA = 20;

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

export default function Pdv() {
  const { usuario } = useAuth();
  const { linhas } = useSacola();
  const [eventos, setEventos] = useState<EventoAtivo[] | undefined>(undefined);
  const [eventoId, setEventoId] = useState<string | null>(lerEscolha());
  const [itens, setItens] = useState<ItemCardapio[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [aberta, setAberta] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [concluida, setConcluida] = useState<Conclusao | null>(null);

  // Evento em uso: o escolhido (se ainda estiver aberto) ou o primeiro da lista (o padrão).
  const evento: EventoAtivo | null | undefined =
    eventos === undefined ? undefined : (eventos.find((e) => e.id === eventoId) ?? eventos[0] ?? null);
  const idAtual = evento?.id ?? null;

  const atualizar = useCallback(async () => {
    try {
      const lista = await carregarEventosAtivos();
      setEventos(lista);
      const em = lista.find((e) => e.id === idAtual) ?? lista[0];
      setItens(em ? await carregarCardapio(em.id) : []);
      setErro("");
    } catch {
      setErro("Não foi possível carregar o cardápio. Verifique a conexão.");
    }
  }, [idAtual]);
  useEffect(() => { void atualizar(); }, [atualizar]);

  function trocarEvento(novoId: string) {
    if (novoId === idAtual) return;
    if (totalItens(linhas) > 0 && !window.confirm("Trocar de evento descarta a sacola atual. Trocar mesmo?")) return;
    useSacola.getState().limpar();
    setItens([]);
    setBusca("");
    setCategoria("Todas");
    gravarEscolha(novoId);
    setEventoId(novoId);
  }

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
          {eventos && eventos.length > 1 ? (
            <select aria-label="Evento" value={idAtual ?? ""} onChange={(e) => trocarEvento(e.target.value)}
              className="max-w-[60%] truncate rounded-lg bg-white px-2 py-1 text-sm font-bold text-marca-900">
              {eventos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          ) : (
            <span className="truncate text-sm font-bold">{evento?.nome ?? "Caixa"}</span>
          )}
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
        {evento && !erro && itens.length === 0 && (
          <p role="status" className="rounded-xl bg-amber-100 p-4 text-center font-semibold text-amber-900">
            O evento “{evento.nome}” ainda não tem produtos no cardápio. Peça à Secretaria ou ao Conselho para montar o cardápio (Produtos) ou copiá-lo de outro evento (Eventos).
          </p>
        )}
        <ul className="flex flex-col gap-3">{visiveis.map((i) => <Cartao key={i.id} item={i} />)}</ul>
      </main>

      {qtdTotal > 0 && evento && (
        <button onClick={() => setAberta(true)} className="fixed inset-x-3 bottom-4 z-30 mx-auto max-w-md rounded-2xl bg-marca-700 py-4 text-lg font-extrabold text-white shadow-xl active:bg-marca-900">
          Ver sacola · {qtdTotal} {qtdTotal === 1 ? "item" : "itens"} · {brl(totalCentavos(linhas))}
        </button>
      )}

      {aberta && evento && qtdTotal > 0 && (
        <Folha aoFechar={() => setAberta(false)} aoPagar={() => { setAberta(false); setPagando(true); }} />
      )}
      {aberta && qtdTotal === 0 && <FechaSozinha aoFechar={() => setAberta(false)} />}
      {pagando && evento && qtdTotal > 0 && (
        <Pagamento evento={evento}
          aoVoltar={() => { setPagando(false); setAberta(true); }}
          aoConcluir={(c) => { setPagando(false); setConcluida(c); void atualizar(); }} />
      )}

      {concluida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-green-700 p-6 text-white">
          <div className="w-full max-w-md text-center">
            <p className="text-lg font-semibold">Venda nº {concluida.numero} registrada · {brl(concluida.total)}</p>
            {concluida.trocoCentavos > 0 && (
              <p className="mt-4 rounded-2xl bg-white py-4 text-4xl font-extrabold text-green-800">TROCO {brl(concluida.trocoCentavos)}</p>
            )}
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
