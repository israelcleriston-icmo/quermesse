import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { emailDoCpf } from "../lib/cpf";
import { supabase } from "../lib/supabase";
import { trocarMinhaSenha, validarNovaSenha } from "../lib/senha";
import { useAuth } from "../store/auth";

const campo = "w-full rounded-xl border-2 border-marca-200 bg-white px-4 py-4 text-lg outline-none focus:border-marca-600";

export default function TrocarSenha() {
  const { usuario, senhaTrocada, sair } = useAuth();
  const navigate = useNavigate();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!usuario) return null;
  const obrigatoria = usuario.deveTrocarSenha;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? "";
    const cpf = email.split("@")[0];
    const msg = validarNovaSenha({ atual, nova, confirmacao, cpf });
    if (msg) return setErro(msg);
    setOcupado(true);
    setErro("");
    try {
      await trocarMinhaSenha({ email: email || emailDoCpf(cpf), atual, nova });
      senhaTrocada();
      navigate("/", { replace: true });
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Erro ao trocar a senha.");
      setOcupado(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-extrabold text-marca-700">Trocar senha</h1>
        {obrigatoria && <p className="mt-2 rounded-lg bg-amber-100 p-3 font-semibold text-amber-900">Sua senha é temporária. Crie uma senha nova para continuar.</p>}
      </header>
      <form onSubmit={enviar} className="flex flex-col gap-3 rounded-2xl bg-white p-6 shadow-lg">
        <input aria-label="Senha atual" className={campo} type="password" autoComplete="current-password" placeholder="Senha atual" value={atual} onChange={(e) => setAtual(e.target.value)} />
        <input aria-label="Nova senha" className={campo} type="password" autoComplete="new-password" placeholder="Nova senha (mínimo 8 caracteres)" value={nova} onChange={(e) => setNova(e.target.value)} />
        <input aria-label="Confirmar nova senha" className={campo} type="password" autoComplete="new-password" placeholder="Repita a nova senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <button type="submit" disabled={ocupado} className="rounded-xl bg-marca-600 py-4 text-lg font-bold text-white active:bg-marca-700 disabled:bg-slate-300">{ocupado ? "Salvando…" : "Salvar nova senha"}</button>
      </form>
      {obrigatoria
        ? <button onClick={() => void sair()} className="text-center font-semibold text-marca-700">Sair</button>
        : <Link to="/" className="text-center font-semibold text-marca-700">← Voltar</Link>}
    </main>
  );
}
