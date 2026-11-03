import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { dataBR } from "../lib/gestao";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

interface Evento { id: string; codigo: string; nome: string; data_inicio: string; data_fim: string; status: "aberto" | "encerrado"; padrao: boolean; chave_pix_id: string }
interface Chave { id: string; chave: string; descricao: string | null }

const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";
const resumo = (c: string) => (c.length > 14 ? `${c.slice(0, 8)}…${c.slice(-4)}` : c);

function traduzir(error: { message?: string; code?: string }, padrao: string): string {
  const m = error.message ?? "";
  if (m.includes("eventos_codigo_key")) return "Já existe um evento com esse código.";
  if (m.includes("eventos_padrao_unico")) return "Já existe outro evento padrão aberto. Desmarque-o antes.";
  if (m.includes("chaves_pix_organizacao_id_chave_key")) return "Essa chave já está cadastrada: escolha-a na lista.";
  return padrao;
}

function FormEvento({ organizacaoId, evento, chaves, aoSalvar, aoFechar }: {
  organizacaoId: string; evento: Evento | null; chaves: Chave[]; aoSalvar: (aviso: string, criado?: { id: string; nome: string }) => void; aoFechar: () => void;
}) {
  const edicao = evento !== null;
  const [nome, setNome] = useState(evento?.nome ?? "");
  const [codigo, setCodigo] = useState(evento?.codigo ?? "");
  const [inicio, setInicio] = useState(evento?.data_inicio ?? "");
  const [fim, setFim] = useState(evento?.data_fim ?? "");
  const [chaveId, setChaveId] = useState(evento?.chave_pix_id ?? chaves[0]?.id ?? "nova");
  const [novaChave, setNovaChave] = useState("");
  const [descricao, setDescricao] = useState("");
  const [padrao, setPadrao] = useState(evento?.padrao ?? false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (ocupado) return;
    if (nome.trim().length < 2) return setErro("Digite o nome do evento.");
    if (!/^[A-Z0-9]{1,10}$/.test(codigo)) return setErro("O código deve ter de 1 a 10 letras maiúsculas ou números (ex.: EVT1).");
    if (!inicio || !fim) return setErro("Informe as datas de início e término.");
    if (fim < inicio) return setErro("A data de término não pode ser anterior ao início.");
    if (chaveId === "nova" && novaChave.trim().length < 3) return setErro("Digite a chave Pix.");
    setOcupado(true);
    setErro("");
    try {
      let chave = chaveId;
      if (chave === "nova") {
        const r = await supabase.from("chaves_pix").insert({ organizacao_id: organizacaoId, chave: novaChave.trim(), descricao: descricao.trim() || null }).select("id").single();
        if (r.error || !r.data) throw new Error(traduzir(r.error ?? {}, "Não foi possível cadastrar a chave Pix."));
        chave = r.data.id;
      }
      const dados = { nome: nome.trim(), data_inicio: inicio, data_fim: fim, chave_pix_id: chave, padrao };
      if (edicao) {
        const r = await supabase.from("eventos").update(dados).eq("id", evento.id);
        if (r.error) throw new Error(traduzir(r.error, "Não foi possível salvar o evento."));
        aoSalvar("Evento atualizado ✓");
      } else {
        const r = await supabase.from("eventos").insert({ ...dados, organizacao_id: organizacaoId, codigo, status: "aberto" }).select("id").single();
        if (r.error || !r.data) throw new Error(traduzir(r.error ?? {}, "Não foi possível salvar o evento."));
        aoSalvar("Evento criado ✓", { id: r.data.id, nome: dados.nome });
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      setOcupado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <h2 className="text-xl font-extrabold text-marca-900">{edicao ? "Editar evento" : "Novo evento"}</h2>
        <label className="text-sm font-semibold">Nome
          <input aria-label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} placeholder="Ex.: Festa do Padroeiro 2026" />
        </label>
        <label className="text-sm font-semibold">Código (usado no TXID do Pix)
          <input aria-label="Código" value={codigo} disabled={edicao} maxLength={10}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className={`${campo} disabled:bg-slate-100`} placeholder="EVT1" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Início
            <input aria-label="Início" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
          </label>
          <label className="text-sm font-semibold">Término
            <input aria-label="Término" type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={campo} />
          </label>
        </div>
        <label className="text-sm font-semibold">Chave Pix do evento
          <select aria-label="Chave Pix" value={chaveId} onChange={(e) => setChaveId(e.target.value)} className={campo}>
            {chaves.map((c) => <option key={c.id} value={c.id}>{c.descricao ? `${c.descricao} · ` : ""}{resumo(c.chave)}</option>)}
            <option value="nova">+ Nova chave…</option>
          </select>
        </label>
        {chaveId === "nova" && (
          <div className="space-y-2 rounded-xl border-2 border-marca-200 bg-white p-3">
            <input aria-label="Nova chave" value={novaChave} onChange={(e) => setNovaChave(e.target.value)} className={campo} placeholder="Chave Pix (aleatória)" />
            <input aria-label="Descrição da chave" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} placeholder="Descrição (opcional)" />
          </div>
        )}
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} className="h-5 w-5" />Evento padrão (vale quando houver mais de um no mesmo dia)
        </label>
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
          <button onClick={aoFechar} className="rounded-xl bg-white py-4 text-lg font-bold text-marca-700">Cancelar</button>
          <button onClick={salvar} disabled={ocupado} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  );
}

const MSG_COPIA: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para copiar o cardápio.",
  EVENTOS_IGUAIS: "Escolha um evento diferente como origem.",
  EVENTO_INEXISTENTE: "Evento não encontrado.",
};

function CopiarCardapio({ destino, origens, contagem, aoConcluir, aoFechar }: {
  destino: { id: string; nome: string }; origens: Evento[]; contagem: Record<string, number>;
  aoConcluir: (texto: string) => void; aoFechar: () => void;
}) {
  const [origem, setOrigem] = useState(origens[0]?.id ?? "");
  const [estoque, setEstoque] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function copiar() {
    if (ocupado || !origem) return;
    setOcupado(true);
    setErro("");
    const { data, error } = await supabase.rpc("copiar_cardapio", { p_origem: origem, p_destino: destino.id, p_copiar_estoque: estoque });
    if (error) {
      const codigo = Object.keys(MSG_COPIA).find((c) => (error.message ?? "").includes(c));
      setErro(codigo ? MSG_COPIA[codigo] : "Não foi possível copiar o cardápio.");
      setOcupado(false);
      return;
    }
    const n = Number(data ?? 0);
    aoConcluir(n === 0 ? "Nada a copiar: o evento já tinha todos esses itens." : `${n} ${n === 1 ? "item copiado" : "itens copiados"} ✓`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60" role="dialog" aria-label="Copiar cardápio">
      <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5">
        <h2 className="text-xl font-extrabold text-marca-900">Copiar cardápio para “{destino.nome}”</h2>
        <label className="block text-sm font-semibold">Copiar do evento
          <select aria-label="Evento de origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={campo}>
            {origens.map((o) => <option key={o.id} value={o.id}>{o.nome} ({contagem[o.id] ?? 0} produtos)</option>)}
          </select>
        </label>
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input type="checkbox" checked={estoque} onChange={(e) => setEstoque(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>Levar também o estoque inicial<span className="block font-normal text-slate-600">Sem marcar, produtos com estoque controlado entram zerados e você informa a carga depois.</span></span>
        </label>
        <p className="text-sm text-slate-600">Os preços são copiados. Itens que o evento já tem não são alterados.</p>
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={aoFechar} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Cancelar</button>
          <button onClick={copiar} disabled={ocupado || !origem} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">{ocupado ? "Copiando…" : "Copiar cardápio"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Eventos() {
  const { usuario } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [chaves, setChaves] = useState<Chave[]>([]);
  const [form, setForm] = useState<{ evento: Evento | null } | null>(null);
  const [encerrando, setEncerrando] = useState<Evento | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [novoCriado, setNovoCriado] = useState<{ id: string; nome: string } | null>(null);
  const [copiando, setCopiando] = useState<{ id: string; nome: string } | null>(null);

  const carregar = useCallback(async () => {
    const [e, c, ep] = await Promise.all([
      supabase.from("eventos").select("id, codigo, nome, data_inicio, data_fim, status, padrao, chave_pix_id").order("data_inicio", { ascending: false }),
      supabase.from("chaves_pix").select("id, chave, descricao").eq("ativo", true).order("created_at"),
      supabase.from("evento_produto").select("evento_id").eq("ativo", true),
    ]);
    if (e.error || c.error || ep.error) return setErro("Não foi possível carregar os eventos.");
    setErro("");
    setEventos((e.data ?? []) as Evento[]);
    setChaves((c.data ?? []) as Chave[]);
    const cont: Record<string, number> = {};
    for (const l of (ep.data ?? []) as { evento_id: string }[]) cont[l.evento_id] = (cont[l.evento_id] ?? 0) + 1;
    setContagem(cont);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (usuario.papel !== "conselho" && usuario.papel !== "admin") return <Navigate to="/" replace />;

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 5000);
    void carregar();
  }

  async function mudarStatus(ev: Evento, status: "aberto" | "encerrado") {
    const { error } = await supabase.from("eventos").update({ status }).eq("id", ev.id);
    setEncerrando(null);
    if (error) setErro(traduzir(error, "Não foi possível alterar o evento."));
    else avisar(status === "encerrado" ? "Evento encerrado ✓" : "Evento reaberto ✓");
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Eventos</h1>
      </header>
      <button onClick={() => setForm({ evento: null })} className="rounded-xl bg-marca-600 py-4 text-lg font-extrabold text-white active:bg-marca-700">+ Novo evento</button>
      {novoCriado && (
        <section role="status" className="space-y-2 rounded-2xl border-2 border-amber-500 bg-amber-50 p-3">
          <p className="font-extrabold text-amber-900">Atenção: o cardápio é por evento</p>
          <p className="text-sm text-amber-900">“{novoCriado.nome}” começa sem produtos. O caixa só consegue vender depois que o cardápio for montado.</p>
          <div className="grid grid-cols-2 gap-2">
            {eventos.some((e) => e.id !== novoCriado.id) && (
              <button onClick={() => setCopiando(novoCriado)} className="rounded-lg bg-amber-600 py-3 font-bold text-white">Copiar de outro evento</button>
            )}
            <Link to="/produtos" className="rounded-lg bg-white py-3 text-center font-bold text-marca-700">Montar em Produtos</Link>
          </div>
          <button onClick={() => setNovoCriado(null)} className="w-full text-sm font-semibold text-amber-900 underline">Entendi</button>
        </section>
      )}
      {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">{aviso}</p>}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      <ul className="flex flex-col gap-2">
        {eventos.map((ev) => {
          const chave = chaves.find((c) => c.id === ev.chave_pix_id);
          return (
            <li key={ev.id} className={`rounded-2xl bg-white p-3 shadow ${ev.status === "encerrado" ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-marca-900">{ev.nome}</p>
                  <p className="text-sm text-slate-500">{ev.codigo} · {dataBR(ev.data_inicio)} a {dataBR(ev.data_fim)}</p>
                  <p className="text-sm text-slate-500">Chave: {chave ? `${chave.descricao ? chave.descricao + " · " : ""}${resumo(chave.chave)}` : "—"}</p>
                  {(contagem[ev.id] ?? 0) > 0
                    ? <p className="text-sm text-slate-500">Cardápio: {contagem[ev.id]} {contagem[ev.id] === 1 ? "produto" : "produtos"}</p>
                    : <p className="text-sm font-bold text-amber-700">⚠ Sem produtos no cardápio</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${ev.status === "aberto" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{ev.status === "aberto" ? "Aberto" : "Encerrado"}</span>
                  {ev.padrao && <span className="rounded-full bg-marca-100 px-2 py-1 text-xs font-bold text-marca-700">Padrão</span>}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ evento: ev })} className="rounded-lg bg-marca-100 py-2 font-bold text-marca-700">Editar</button>
                {ev.status === "aberto"
                  ? <button onClick={() => setEncerrando(ev)} className="rounded-lg border-2 border-red-600 py-2 font-bold text-red-700">Encerrar</button>
                  : <button onClick={() => void mudarStatus(ev, "aberto")} className="rounded-lg bg-marca-600 py-2 font-bold text-white">Reabrir</button>}
              </div>
              {ev.status === "aberto" && eventos.length > 1 && (
                <button onClick={() => setCopiando({ id: ev.id, nome: ev.nome })} className="mt-2 w-full rounded-lg bg-amber-100 py-2 font-bold text-amber-900">Copiar cardápio de outro evento</button>
              )}
            </li>
          );
        })}
        {eventos.length === 0 && !erro && <li className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum evento ainda.</li>}
      </ul>

      <section className="rounded-2xl bg-white p-3 shadow">
        <h2 className="font-extrabold text-marca-900">Chaves Pix</h2>
        <ul className="mt-1 text-sm text-slate-700">
          {chaves.map((c) => <li key={c.id}>{c.descricao ? `${c.descricao} · ` : ""}{resumo(c.chave)}</li>)}
          {chaves.length === 0 && <li>Nenhuma chave. Cadastre ao criar o evento.</li>}
        </ul>
      </section>

      {form && <FormEvento key={form.evento?.id ?? "novo"} organizacaoId={usuario.organizacaoId} evento={form.evento} chaves={chaves}
        aoFechar={() => setForm(null)} aoSalvar={(t, criado) => { setForm(null); if (criado) setNovoCriado(criado); avisar(t); }} />}

      {copiando && (
        <CopiarCardapio destino={copiando} origens={eventos.filter((e) => e.id !== copiando.id)} contagem={contagem}
          aoFechar={() => setCopiando(null)}
          aoConcluir={(t) => { setCopiando(null); setNovoCriado(null); avisar(t); }} />
      )}

      {encerrando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center">
            <p className="text-lg font-bold text-marca-900">Encerrar “{encerrando.nome}”?</p>
            <p className="mt-1 text-sm text-slate-600">Ninguém mais consegue vender neste evento e os QR Pix pendentes são cancelados.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setEncerrando(null)} className="rounded-xl bg-slate-200 py-3 font-bold">Voltar</button>
              <button onClick={() => void mudarStatus(encerrando, "encerrado")} className="rounded-xl bg-red-600 py-3 font-bold text-white">Sim, encerrar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
