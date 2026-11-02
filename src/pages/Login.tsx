import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { cpfValido, formatarCpf, limparCpf } from "../lib/cpf";
import { useAuth } from "../store/auth";

export default function Login() {
  const { usuario, entrar } = useAuth();
  const navigate = useNavigate();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;                       // sem duplo toque
    const numeros = limparCpf(cpf);
    if (!cpfValido(numeros)) return setErro("CPF inválido.");
    if (!senha) return setErro("Digite a senha.");
    setEnviando(true);
    setErro("");
    const msg = await entrar(numeros, senha);
    setEnviando(false);
    if (msg) setErro(msg);
    else navigate("/", { replace: true });
  }

  const campo = "w-full rounded-xl border-2 border-marca-200 bg-white px-4 py-4 text-lg outline-none focus:border-marca-600";
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-4xl font-extrabold text-marca-700">Quermesse</h1>
        <p className="mt-1 text-marca-900/70">Entre com o seu CPF</p>
      </header>
      <form onSubmit={enviar} className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
        <input className={campo} inputMode="numeric" autoComplete="username" placeholder="CPF"
          value={cpf} onChange={(e) => setCpf(formatarCpf(e.target.value))} />
        <input className={campo} type="password" autoComplete="current-password" placeholder="Senha"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        <button type="submit" disabled={enviando}
          className="rounded-xl bg-marca-600 py-4 text-lg font-bold text-white active:bg-marca-700 disabled:bg-slate-300">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
