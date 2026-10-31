import { Link } from "react-router-dom";
import { useAuth, type Papel } from "../store/auth";

const ROTULO: Record<Papel, string> = {
  caixa: "Caixa", secretaria: "Secretaria", conselho: "Conselho Econômico", admin: "Administrador", porteiro: "Portaria",
};

export default function Inicio() {
  const { usuario, sair } = useAuth();
  if (!usuario) return null;
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="rounded-2xl bg-marca-600 p-6 text-white shadow-lg">
        <p className="text-sm opacity-80">{ROTULO[usuario.papel]}</p>
        <h1 className="text-2xl font-extrabold">Olá, {usuario.nome.split(" ")[0]}!</h1>
      </header>
      <section className="rounded-2xl bg-white p-6 shadow">
        {usuario.papel === "caixa" || usuario.papel === "secretaria" ? (
          <Link to="/pdv" className="block rounded-xl bg-marca-600 py-5 text-center text-xl font-extrabold text-white active:bg-marca-700">
            Abrir caixa
          </Link>
        ) : (
          <p className="text-slate-600">Painel do {ROTULO[usuario.papel]} nas próximas etapas.</p>
        )}
      </section>
      <button onClick={sair} className="rounded-xl border-2 border-marca-600 py-4 text-lg font-bold text-marca-700 active:bg-marca-100">
        Sair
      </button>
    </main>
  );
}
