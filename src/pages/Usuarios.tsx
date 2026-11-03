import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { cpfValido, formatarCpf, limparCpf } from "../lib/cpf";
import { PAPEIS, ROTULO_PAPEL, alterarMembro, criarUsuario, mascararCpf, redefinirSenhaDeUsuario } from "../lib/gestao";
import { supabase } from "../lib/supabase";
import { useAuth, type Papel } from "../store/auth";

interface Membro { usuario_id: string; papel: Papel; ativo: boolean; perfis: { nome: string; cpf: string } | null }

const campo = "w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg outline-none focus:border-marca-600";

function FormNovo({ organizacaoId, aoSalvar, aoFechar }: { organizacaoId: string; aoSalvar: () => void; aoFechar: () => void }) {
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [papel, setPapel] = useState<Papel>("caixa");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (ocupado) return;
    const numeros = limparCpf(cpf);
    if (nome.trim().length < 2) return setErro("Digite o nome.");
    if (!cpfValido(numeros)) return setErro("CPF inválido.");
    if (senha.length < 8) return setErro("A senha inicial deve ter pelo menos 8 caracteres.");
    if (senha === numeros) return setErro("A senha não pode ser o próprio CPF.");
    setOcupado(true);
    setErro("");
    try {
      await criarUsuario({ organizacaoId, nome: nome.trim(), cpf: numeros, senha, papel });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar o usuário.");
      setOcupado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <h2 className="text-xl font-extrabold text-marca-900">Novo usuário</h2>
        <label className="text-sm font-semibold">Nome
          <input aria-label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </label>
        <label className="text-sm font-semibold">CPF
          <input aria-label="CPF" inputMode="numeric" value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} className={campo} />
        </label>
        <label className="text-sm font-semibold">Perfil
          <select aria-label="Perfil" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} className={campo}>
            {PAPEIS.map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Senha inicial (mínimo 8 caracteres)
          <input aria-label="Senha inicial" value={senha} onChange={(e) => setSenha(e.target.value)} className={campo} autoComplete="off" />
        </label>
        <p className="text-sm text-slate-600">Anote a senha e entregue ao usuário. Ela não poderá ser consultada depois.</p>
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-2">
          <button onClick={aoFechar} className="rounded-xl bg-white py-4 text-lg font-bold text-marca-700">Cancelar</button>
          <button onClick={salvar} disabled={ocupado} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">{ocupado ? "Criando…" : "Criar usuário"}</button>
        </div>
      </div>
    </div>
  );
}

function RedefinirSenha({ membro, organizacaoId, aoConcluir }: { membro: Membro; organizacaoId: string; aoConcluir: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function redefinir() {
    if (ocupado) return;
    if (senha.length < 8) return setErro("A senha temporária deve ter pelo menos 8 caracteres.");
    if (senha === (membro.perfis?.cpf ?? "")) return setErro("A senha não pode ser o próprio CPF.");
    setOcupado(true);
    setErro("");
    try {
      await redefinirSenhaDeUsuario({ organizacaoId, usuarioId: membro.usuario_id, senha });
      aoConcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao redefinir a senha.");
      setOcupado(false);
    }
  }

  if (!aberto) {
    return <button onClick={() => setAberto(true)} className="w-full rounded-xl border-2 border-amber-500 py-3 font-bold text-amber-800">Esqueceu a senha?</button>;
  }
  return (
    <div className="space-y-2 rounded-xl border-2 border-amber-500 bg-amber-50 p-3">
      <label className="block text-sm font-semibold">Senha temporária (mínimo 8 caracteres)
        <input aria-label="Senha temporária" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" className={campo} />
      </label>
      <p className="text-sm text-slate-700">Entregue esta senha ao usuário. No próximo acesso ele será obrigado a criar uma senha nova.</p>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      <button onClick={redefinir} disabled={ocupado} className="w-full rounded-xl bg-amber-600 py-3 font-extrabold text-white disabled:opacity-40">{ocupado ? "Salvando…" : "Definir senha temporária"}</button>
    </div>
  );
}

function FormAlterar({ membro, organizacaoId, aoSalvar, aoFechar, aoRedefinir }: { membro: Membro; organizacaoId: string; aoSalvar: () => void; aoFechar: () => void; aoRedefinir?: () => void }) {
  const [papel, setPapel] = useState<Papel>(membro.papel);
  const [ativo, setAtivo] = useState(membro.ativo);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (ocupado) return;
    setOcupado(true);
    setErro("");
    try {
      await alterarMembro({ usuarioId: membro.usuario_id, organizacaoId, papel, ativo });
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao alterar.");
      setOcupado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="mx-auto w-full max-w-md space-y-3 rounded-t-3xl bg-white p-5">
        <h2 className="text-xl font-extrabold text-marca-900">{membro.perfis?.nome}</h2>
        <label className="block text-sm font-semibold">Perfil
          <select aria-label="Perfil" value={papel} onChange={(e) => setPapel(e.target.value as Papel)} className={campo}>
            {PAPEIS.map((p) => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-5 w-5" />Usuário ativo (pode entrar no sistema)
        </label>
        <RedefinirSenha membro={membro} organizacaoId={organizacaoId} aoConcluir={() => aoRedefinir?.()} />
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={aoFechar} className="rounded-xl bg-slate-200 py-4 text-lg font-bold">Cancelar</button>
          <button onClick={salvar} disabled={ocupado} className="rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white disabled:opacity-40">Salvar</button>
        </div>
      </div>
    </div>
  );
}

export default function Usuarios() {
  const { usuario } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const org = usuario?.organizacaoId ?? "";

  const carregar = useCallback(async () => {
    if (!org) return;
    const { data, error } = await supabase.from("membros").select("usuario_id, papel, ativo, perfis(nome, cpf)").eq("organizacao_id", org);
    if (error) return setErro("Não foi possível carregar os usuários.");
    setErro("");
    const lista = (data ?? []) as unknown as Membro[];
    setMembros(lista.sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.perfis?.nome ?? "").localeCompare(b.perfis?.nome ?? "")));
  }, [org]);
  useEffect(() => { void carregar(); }, [carregar]);

  if (!usuario) return null;
  if (usuario.papel !== "admin") return <Navigate to="/" replace />;

  function salvou(texto: string) {
    setNovo(false);
    setEditando(null);
    setAviso(texto);
    setTimeout(() => setAviso(""), 5000);
    void carregar();
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <Link to="/" className="font-semibold text-marca-700">← Início</Link>
        <h1 className="text-xl font-extrabold text-marca-900">Usuários</h1>
      </header>
      <button onClick={() => setNovo(true)} className="rounded-xl bg-marca-600 py-4 text-lg font-extrabold text-white active:bg-marca-700">+ Novo usuário</button>
      {aviso && <p role="status" className="rounded-lg bg-green-100 p-3 text-center font-bold text-green-800">{aviso}</p>}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
      <ul className="flex flex-col gap-2">
        {membros.map((m) => (
          <li key={m.usuario_id} className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow ${m.ativo ? "" : "opacity-50"}`}>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-marca-900">{m.perfis?.nome ?? "—"}{m.usuario_id === usuario.id && <span className="font-normal text-slate-500"> (você)</span>}</p>
              <p className="text-sm text-slate-500">{mascararCpf(m.perfis?.cpf ?? "")} · {ROTULO_PAPEL[m.papel]}{m.ativo ? "" : " · desativado"}</p>
            </div>
            {m.usuario_id !== usuario.id && (
              <button onClick={() => setEditando(m)} className="rounded-lg bg-marca-100 px-3 py-2 text-sm font-bold text-marca-700">Alterar</button>
            )}
          </li>
        ))}
        {membros.length === 0 && !erro && <li className="rounded-xl bg-white p-6 text-center text-slate-600">Nenhum usuário.</li>}
      </ul>
      {novo && <FormNovo organizacaoId={org} aoFechar={() => setNovo(false)} aoSalvar={() => salvou("Usuário criado ✓")} />}
      {editando && <FormAlterar membro={editando} organizacaoId={org} aoFechar={() => setEditando(null)} aoSalvar={() => salvou("Usuário atualizado ✓")} aoRedefinir={() => salvou("Senha temporária definida ✓")} />}
    </main>
  );
}
