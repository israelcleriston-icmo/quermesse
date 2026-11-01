import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { brl } from "../lib/dinheiro";
import { novoId } from "../lib/id";
import { comprimirImagem } from "../lib/imagem";
import { GENERICAS, sugerirImagem, urlImagem } from "../lib/imagens";
import { lerReais, centavosParaTexto } from "../lib/pagamento";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

interface Produto { id: string; nome: string; imagem_path: string | null; ativo: boolean; categoria_id: string | null; categorias: { nome: string } | null }
interface Categoria { id: string; nome: string }
interface Evento { id: string; codigo: string; nome: string }
interface Cardapio { id: string; produto_id: string; valor: string | number; estoque_inicial: number | null; estoque_atual: number | null }

const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";

function FormProduto({ organizacaoId, categorias, produto, evento, cardapio, aoSalvar, aoFechar }: {
  organizacaoId: string; categorias: Categoria[]; produto: Produto | null; evento: Evento | null; cardapio: Cardapio | null;
  aoSalvar: (aviso: string) => void; aoFechar: () => void;
}) {
  const edicao = produto !== null;
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoria_id ?? categorias[0]?.id ?? "nova");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [imagem, setImagem] = useState<string | null>(produto?.imagem_path ?? null);
  const [escolhida, setEscolhida] = useState(edicao);       // o usuário já escolheu: para de sugerir
  const [incluir, setIncluir] = useState(true);
  const [valorTxt, setValorTxt] = useState(cardapio ? centavosParaTexto(Math.round(Number(cardapio.valor) * 100)) : "");
  const [ilimitado, setIlimitado] = useState(false);
  const [qtdTxt, setQtdTxt] = useState("");
  const [remessaTxt, setRemessaTxt] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  function mudarNome(v: string) {
    setNome(v);
    if (!escolhida) setImagem(sugerirImagem(v));
  }

  async function enviarFoto(f: File | undefined) {
    if (!f) return;
    setOcupado("Enviando a foto…");
    setErro("");
    try {
      const blob = await comprimirImagem(f, 800, 0.8);
      const path = `${organizacaoId}/${novoId()}.jpg`;
      const { error } = await supabase.storage.from("produtos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("Não foi possível enviar a foto.");
      setImagem(path);
      setEscolhida(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setOcupado("");
    }
  }

  async function remessa() {
    if (!cardapio || ocupado) return;
    const n = /^\d+$/.test(remessaTxt.trim()) ? Number(remessaTxt) : 0;
    if (n < 1) return setErro("Digite a quantidade da remessa (número inteiro).");
    setOcupado("Adicionando remessa…");
    setErro("");
    const { error } = await supabase.rpc("adicionar_remessa", { p_evento_produto_id: cardapio.id, p_qtd: n });
    if (error) {
      setErro("Não foi possível adicionar a remessa.");
      setOcupado("");
    } else {
      aoSalvar(`Remessa de ${n} adicionada ✓`);
    }
  }

  async function salvar() {
    if (ocupado) return;
    const n = nome.trim();
    if (n.length < 2) return setErro("Digite o nome do produto.");
    if (categoriaId === "nova" && novaCategoria.trim().length < 2) return setErro("Digite o nome da categoria.");
    const valorC = lerReais(valorTxt);
    const noCardapio = Boolean(evento) && (incluir || Boolean(cardapio));
    if (noCardapio && (valorC === null || valorC <= 0)) return setErro("Digite o valor do produto neste evento.");
    let estoque: number | null = null;
    if (noCardapio && !cardapio && !ilimitado) {
      if (!/^\d+$/.test(qtdTxt.trim())) return setErro("Digite o estoque inicial (número inteiro) ou marque estoque ilimitado.");
      estoque = Number(qtdTxt);
    }
    setOcupado("Salvando…");
    setErro("");
    try {
      let cat = categoriaId;
      if (cat === "nova") {
        const r = await supabase.from("categorias").insert({ organizacao_id: organizacaoId, nome: novaCategoria.trim() }).select("id").single();
        if (r.error || !r.data) throw new Error(r.error?.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria.");
        cat = r.data.id;
      }
      let produtoId = produto?.id ?? "";
      if (edicao) {
        const { error } = await supabase.from("produtos").update({ nome: n, categoria_id: cat, imagem_path: imagem }).eq("id", produtoId);
        if (error) throw new Error(error.code === "23505" ? "Já existe um produto com esse nome." : "Não foi possível salvar o produto.");
      } else {
        const r = await supabase.from("produtos").insert({ organizacao_id: organizacaoId, categoria_id: cat, nome: n, imagem_path: imagem }).select("id").single();
        if (r.error || !r.data) throw new Error(r.error?.code === "23505" ? "Já existe um produto com esse nome." : "Não foi possível salvar o produto.");
        produtoId = r.data.id;
      }
      if (evento && noCardapio && valorC !== null) {
        const valor = valorC / 100;
        const r = cardapio
          ? await supabase.from("evento_produto").update({ valor, ativo: true }).eq("id", cardapio.id)
          : await supabase.from("evento_produto").insert({ evento_id: evento.id, produto_id: produtoId, valor, estoque_inicial: estoque });
        if (r.error) throw new Error("O produto foi salvo, mas não foi possível colocá-lo no cardápio do evento.");
      }
      aoSalvar(edicao ? "Produto atualizado ✓" : noCardapio ? "Produto salvo e incluído no cardápio ✓" : "Produto salvo ✓");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      setOcupado("");
    }
  }

  const previa = urlImagem(imagem);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <h2 className="text-xl font-extrabold text-marca-900">{edicao ? "Editar produto" : "Novo produto"}</h2>
        <label className="text-sm font-semibold">Nome
          <input aria-label="Nome" value={nome} onChange={(e) => mudarNome(e.target.value)} className={campo} placeholder="Ex.: Pastel de queijo" />
        </label>
        <label className="text-sm font-semibold">Categoria
          <select aria-label="Categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campo}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            <option value="nova">+ Nova categoria…</option>
          </select>
        </label>
        {categoriaId === "nova" && (
          <input aria-label="Nova categoria" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} className={campo} placeholder="Nome da categoria" />
        )}

        <div>
          <p className="text-sm font-semibold">Foto {imagem?.startsWith("generico/") && !escolhida && <span className="font-normal text-marca-600">(sugerida pelo nome)</span>}</p>
          <div className="mt-1 flex items-center gap-3">
            {previa ? <img src={previa} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-marca-100 text-sm text-marca-600">sem foto</div>}
            <button onClick={() => arquivo.current?.click()} className="rounded-xl bg-marca-600 px-4 py-3 font-bold text-white">Enviar minha foto</button>
            <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {GENERICAS.map((g) => {
              const path = `generico/${g.id}`;
              return (
                <button key={g.id} aria-label={g.nome} aria-pressed={imagem === path} onClick={() => { setImagem(path); setEscolhida(true); }}
                  className={`rounded-xl border-2 p-1 ${imagem === path ? "border-marca-600 bg-marca-100" : "border-transparent"}`}>
                  <img src={urlImagem(path) ?? ""} alt="" className="h-14 w-full rounded-lg" />
                  <span className="text-[11px] font-semibold">{g.nome}</span>
                </button>
              );
            })}
          </div>
        </div>

        {evento ? (
          <section className="space-y-3 rounded-2xl border-2 border-marca-200 bg-white p-3">
            <p className="font-extrabold text-marca-900">Cardápio de {evento.nome}</p>
            {!cardapio && (
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} className="h-5 w-5" />Incluir no cardápio deste evento</label>
            )}
            {(incluir || cardapio) && (
              <>
                <label className="block text-sm font-semibold">Valor neste evento (R$)
                  <input aria-label="Valor" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} className={campo} placeholder="0,00" />
                </label>
                {!cardapio ? (
                  <>
                    <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={ilimitado} onChange={(e) => setIlimitado(e.target.checked)} className="h-5 w-5" />Estoque ilimitado (rifa, doação…)</label>
                    {!ilimitado && (
                      <label className="block text-sm font-semibold">Estoque inicial (quantidade)
                        <input aria-label="Estoque inicial" inputMode="numeric" value={qtdTxt} onChange={(e) => setQtdTxt(e.target.value)} className={campo} placeholder="Ex.: 100" />
                      </label>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-marca-50 p-3">
                    <p className="font-semibold">Estoque atual: {cardapio.estoque_atual === null ? "ilimitado" : cardapio.estoque_atual}</p>
                    {cardapio.estoque_atual !== null && (
                      <div className="mt-2 flex gap-2">
                        <input aria-label="Remessa" inputMode="numeric" value={remessaTxt} onChange={(e) => setRemessaTxt(e.target.value)} placeholder="+ quantidade" className={campo} />
                        <button onClick={remessa} disabled={!!ocupado} className="shrink-0 rounded-xl bg-marca-600 px-4 font-bold text-white disabled:opacity-40">+ Remessa</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Não há evento aberto: o produto será salvo no catálogo. O preço e o estoque são definidos quando houver um evento.</p>
        )}

        {ocupado && <p className="rounded-lg bg-marca-100 p-3 text-center font-semibold text-marca-700">{ocupado}</p>}
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
          <button onClick={aoFechar} className="rounded-xl bg-white py-4 text-lg font-bold text-marca-700">Cancelar</button>
          <button onClick={salvar} disabled={!!ocupado} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function Produtos() {
  const { usuario } = useAuth();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState("");
  const [cardapio, setCardapio] = useState<Record<string, Cardapio>>({});
  const [form, setForm] = useState<{ produto: Produto | null } | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async (evId?: string) => {
    const [c, p, e] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("ativo", true).order("ordem").order("nome"),
      supabase.from("produtos").select("id, nome, imagem_path, ativo, categoria_id, categorias(nome)").eq("tipo", "normal").order("nome"),
      supabase.from("eventos").select("id, codigo, nome").eq("status", "aberto").order("data_inicio"),
    ]);
    if (c.error || p.error || e.error) return setErro("Não foi possível carregar os produtos.");
    setErro("");
    setCategorias((c.data ?? []) as Categoria[]);
    setProdutos((p.data ?? []) as unknown as Produto[]);
    const evs = (e.data ?? []) as Evento[];
    setEventos(evs);
    const atual = evId ?? evs[0]?.id ?? "";
    setEventoId((antes) => (evs.some((x) => x.id === (evId ?? antes)) ? (evId ?? antes) : atual));
    const alvo = evs.some((x) => x.id === (evId ?? "")) ? (evId as string) : atual;
    if (alvo) {
      const r = await supabase.from("evento_produto").select("id, produto_id, valor, estoque_inicial, estoque_atual").eq("evento_id", alvo);
      const mapa: Record<string, Cardapio> = {};
      for (const x of (r.data ?? []) as Cardapio[]) mapa[x.produto_id] = x;
      setCardapio(mapa);
    } else setCardapio({});
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (!["secretaria", "conselho", "admin"].includes(usuario.papel)) return <Navigate to="/" replace />;

  const evento = eventos.find((x) => x.id === eventoId) ?? null;

  async function alternar(p: Produto) {
    const { error } = await supabase.from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) setErro("Não foi possível alterar o produto.");
    else void carregar(eventoId);
  }

  function salvou(texto: string) {
    setForm(null);
    setAviso(texto);
    setTimeout(() => setAviso(""), 5000);
    void carregar(eventoId);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Produtos</h1>
      </header>
      {eventos.length > 0 && (
        <label className="text-sm font-semibold">Evento (preços e estoque)
          <select aria-label="Evento" value={eventoId} onChange={(e) => { setEventoId(e.target.value); void carregar(e.target.value); }} className={campo}>
            {eventos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
      )}
      <button onClick={() => setForm({ produto: null })} className="rounded-xl bg-marca-600 py-4 text-lg font-extrabold text-white active:bg-marca-700">+ Novo produto</button>
      {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">{aviso}</p>}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      <ul className="flex flex-col gap-2">
        {produtos.map((p) => {
          const c = cardapio[p.id];
          return (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow ${p.ativo ? "" : "opacity-50"}`}>
              {urlImagem(p.imagem_path) ? <img src={urlImagem(p.imagem_path)!} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-marca-100" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-marca-900">{p.nome}</p>
                <p className="text-sm text-slate-500">{p.categorias?.nome ?? "Sem categoria"}{p.ativo ? "" : " · desativado"}</p>
                {evento && (c
                  ? <p className="text-sm font-semibold text-marca-700">{brl(Math.round(Number(c.valor) * 100))} · estoque {c.estoque_atual === null ? "ilimitado" : c.estoque_atual}</p>
                  : <p className="text-sm text-amber-700">Fora do cardápio de {evento.codigo}</p>)}
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => setForm({ produto: p })} className="rounded-lg bg-marca-600 px-3 py-2 text-sm font-bold text-white">Editar</button>
                <button onClick={() => alternar(p)} className="rounded-lg bg-marca-100 px-3 py-2 text-sm font-bold text-marca-700">{p.ativo ? "Desativar" : "Ativar"}</button>
              </div>
            </li>
          );
        })}
        {produtos.length === 0 && !erro && <li className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum produto ainda.</li>}
      </ul>
      {form && (
        <FormProduto key={form.produto?.id ?? "novo"} organizacaoId={usuario.organizacaoId} categorias={categorias} produto={form.produto}
          evento={evento} cardapio={form.produto ? cardapio[form.produto.id] ?? null : null}
          aoFechar={() => setForm(null)} aoSalvar={salvou} />
      )}
    </main>
  );
}
