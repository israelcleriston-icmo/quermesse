import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";
import InstalarApp from "../components/InstalarApp";
import { useAuth, type Papel } from "../store/auth";
import { totalItens, useSacola } from "../store/sacola";

const ROTULO: Record<Papel, string> = {
  caixa: "Caixa", secretaria: "Secretaria", conselho: "Conselho Econômico", admin: "Administrador", porteiro: "Portaria",
};

export default function Inicio() {
  const { usuario, sair, trocarPapel } = useAuth();
  const [erroTroca, setErroTroca] = useState("");
  const linhas = useSacola((s) => s.linhas);
  if (!usuario) return null;
  const aoSair = () => {
    if (totalItens(linhas) > 0 && !window.confirm("Há uma venda em andamento. Sair descarta a sacola. Sair mesmo?")) return;
    void sair();
  };
  const aoTrocar = async (p: Papel) => {
    if (p === usuario.papel) return;
    if (totalItens(linhas) > 0 && !window.confirm("Há uma venda em andamento. Trocar de perfil descarta a sacola. Trocar mesmo?")) return;
    setErroTroca((await trocarPapel(p)) ?? "");
  };
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-6 p-6">
      <header className="flex items-center gap-4 rounded-2xl bg-marca-600 p-6 text-white shadow-lg">
        <Logo tamanho={64} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-sm opacity-80">{ROTULO[usuario.papel]}</p>
          <h1 className="truncate text-2xl font-extrabold">Olá, {usuario.nome.split(" ")[0]}!</h1>
        </div>
      </header>
      {(usuario.papeis?.length ?? 0) > 1 && (
        <section className="rounded-2xl bg-white p-4 shadow">
          <label className="block text-sm font-semibold text-slate-600">Você está como
            <select aria-label="Trocar perfil" value={usuario.papel} onChange={(e) => void aoTrocar(e.target.value as Papel)}
              className="mt-1 w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-lg font-bold text-marca-900 outline-none focus:border-marca-600">
              {(usuario.papeis ?? []).map((p) => <option key={p} value={p}>{ROTULO[p]}</option>)}
            </select>
          </label>
          {erroTroca && <p role="alert" className="mt-2 rounded-lg bg-red-50 p-2 text-sm font-medium text-red-700">{erroTroca}</p>}
        </section>
      )}
      <section className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-3">
          {(usuario.papel === "caixa" || usuario.papel === "secretaria") && (
            <Link to="/pdv" className="block rounded-xl bg-marca-600 py-5 text-center text-xl font-extrabold text-white active:bg-marca-700">Vender (PDV)</Link>
          )}
          {(usuario.papel === "caixa" || usuario.papel === "secretaria") && (
            <Link to="/turno" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Meu turno de caixa</Link>
          )}
          {(usuario.papel === "conselho" || usuario.papel === "admin") && (
            <Link to="/conferencia" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Conferência dos caixas</Link>
          )}
          {(usuario.papel === "conselho" || usuario.papel === "admin") && (
            <Link to="/vendas" className="block rounded-xl bg-marca-100 py-5 text-center text-xl font-extrabold text-marca-700 active:bg-marca-200">Vendas e anulações</Link>
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
      <InstalarApp />
      <Link to="/trocar-senha" className="text-center font-semibold text-marca-700 underline">Trocar minha senha</Link>
      <button onClick={aoSair} className="rounded-xl border-2 border-marca-600 py-4 text-lg font-bold text-marca-700 active:bg-marca-100">
        Sair
      </button>
    </main>
  );
}
