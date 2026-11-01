import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { GENERICAS, sugerirImagem, urlImagem } from "../lib/imagens";
import { novoId } from "../lib/id";
import { comprimirImagem } from "../lib/imagem";
import { supabase } from "../lib/supabase";
import { useAuth } from "../store/auth";

interface Produto { id: string; nome: string; imagem_path: string | null; ativo: boolean; categorias: { nome: string } | null }
interface Categoria { id: string; nome: string }

function FormProduto({ organizacaoId, categorias, aoSalvar, aoFechar }: {
  organizacaoId: string; categorias: Categoria[]; aoSalvar: () => void; aoFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "nova");
  const [novaCategoria, setNovaCategoria] = useState("");
  const [imagem, setImagem] = useState<string | null>(null);
  const [escolhida, setEscolhida] = useState(false); // o usuário já escolheu: para de sugerir
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  function mudarNome(v: string) {
    setNome(v);
    if (!escolhida) setImagem(sugerirImagem(v));        // sugere a foto pelo nome
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

  async function salvar() {
    if (ocupado) return;
    const n = nome.trim();
    if (n.length < 2) return setErro("Digite o nome do produto.");
    if (categoriaId === "nova" && novaCategoria.trim().length < 2) return setErro("Digite o nome da categoria.");
    setOcupado("Salvando…");
    setErro("");
    try {
      let cat = categoriaId;
      if (cat === "nova") {
        const r = await supabase.from("categorias").insert({ organizacao_id: organizacaoId, nome: novaCategoria.trim() }).select("id").single();
        if (r.error || !r.data) throw new Error(r.error?.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria.");
        cat = r.data.id;
      }
      const { error } = await supabase.from("produtos").insert({ organizacao_id: organizacaoId, categoria_id: cat, nome: n, imagem_path: imagem });
      if (error) throw new Error(error.code === "23505" ? "Já existe um produto com esse nome." : "Não foi possível salvar o produto.");
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      setOcupado("");
    }
  }

  const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";
  const previa = urlImagem(imagem);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <h2 className="text-xl font-extrabold text-marca-900">Novo produto</h2>
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
            {previa ? <img src={previa} alt="" className="h-20 w-20 rounded-xl object-cover" /> : <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-marca-100 text-marca-600">sem foto</div>}
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
  const [novo, setNovo] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [c, p] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("ativo", true).order("ordem").order("nome"),
      supabase.from("produtos").select("id, nome, imagem_path, ativo, categorias(nome)").eq("tipo", "normal").order("nome"),
    ]);
    if (c.error || p.error) return setErro("Não foi possível carregar os produtos.");
    setErro("");
    setCategorias((c.data ?? []) as Categoria[]);
    setProdutos((p.data ?? []) as unknown as Produto[]);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (!["secretaria", "conselho", "admin"].includes(usuario.papel)) return <Navigate to="/" replace />;

  async function alternar(p: Produto) {
    const { error } = await supabase.from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    if (error) setErro("Não foi possível alterar o produto.");
    else void carregar();
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Produtos</h1>
      </header>
      <button onClick={() => setNovo(true)} className="rounded-xl bg-marca-600 py-4 text-lg font-extrabold text-white active:bg-marca-700">+ Novo produto</button>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      <ul className="flex flex-col gap-2">
        {produtos.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow ${p.ativo ? "" : "opacity-50"}`}>
            {urlImagem(p.imagem_path) ? <img src={urlImagem(p.imagem_path)!} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="h-16 w-16 rounded-xl bg-marca-100" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-marca-900">{p.nome}</p>
              <p className="text-sm text-slate-500">{p.categorias?.nome ?? "Sem categoria"}{p.ativo ? "" : " · desativado"}</p>
            </div>
            <button onClick={() => alternar(p)} className="rounded-lg bg-marca-100 px-3 py-2 text-sm font-bold text-marca-700">{p.ativo ? "Desativar" : "Ativar"}</button>
          </li>
        ))}
        {produtos.length === 0 && !erro && <li className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum produto ainda.</li>}
      </ul>
      {novo && <FormProduto organizacaoId={usuario.organizacaoId} categorias={categorias} aoFechar={() => setNovo(false)} aoSalvar={() => { setNovo(false); void carregar(); }} />}
    </main>
  );
}
