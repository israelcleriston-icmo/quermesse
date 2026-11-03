import { Link } from "react-router-dom";
import { useAuth, type Papel } from "../store/auth";
import { totalItens, useSacola } from "../store/sacola";

const ROTULO: Record<Papel, string> = {
  caixa: "Caixa", secretaria: "Secretaria", conselho: "Conselho Econômico", admin: "Administrador", porteiro: "Portaria",
};

export default function Inicio() {
  const { usuario, sair } = useAuth();
  const linhas = useSacola((s) => s.linhas);
  if (!usuario) return null;
  const aoSair = () => {
    if (totalItens(linhas) > 0 && !window.confirm("Há uma venda em andamento. Sair descarta a sacola. Sair mesmo?")) return;
    void sair();
  };
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="rounded-2xl bg-marca-600 p-6 text-white shadow-lg">
        <p className="text-sm opacity-80">{ROTULO[usuario.papel]}</p>
        <h1 className="text-2xl font-extrabold">Olá, {usuario.nome.split(" ")[0]}!</h1>
      </header>
      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-3">
          {(usuario.papel === "caixa" || usuario.papel === "secretaria") && (
            <Link to="/pdv" className="block rounded-xl bg-marca-600 py-5 text-center text-xl font-extrabold text-white active:bg-marca-700">Abrir caixa</Link>
          )}
          {(usuario.papel === "secretaria" || usuario.papel === "conselho" || usuario.papel === "admin") && (
            <Link to="/produtos" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Produtos</Link>
          )}
          {(usuario.papel === "conselho" || usuario.papel === "admin") && (
            <Link to="/eventos" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Eventos e chaves Pix</Link>
          )}
          {usuario.papel === "admin" && (
            <Link to="/usuarios" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Usuários</Link>
          )}
          {(usuario.papel === "conselho" || usuario.papel === "admin" || usuario.papel === "porteiro") && (
            <p className="text-center text-slate-600">Demais telas do perfil {ROTULO[usuario.papel]} nas próximas etapas.</p>
          )}
        </div>
      </section>
      <Link to="/trocar-senha" className="text-center font-semibold text-marca-700 underline">Trocar minha senha</Link>
      <button onClick={aoSair} className="rounded-xl border-2 border-marca-600 py-4 text-lg font-bold text-marca-700 active:bg-marca-100">
        Sair
      </button>
    </main>
  );
}
