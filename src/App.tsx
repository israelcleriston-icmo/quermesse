import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import FaixaAmbiente from "./components/FaixaAmbiente";
import Protegida from "./components/Protegida";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";
import Pdv from "./pages/Pdv";
import CardapioPublico from "./pages/Cardapio";
import Eventos from "./pages/Eventos";
import Produtos from "./pages/Produtos";
import Usuarios from "./pages/Usuarios";
import Turno from "./pages/Turno";
import Conferencia from "./pages/Conferencia";
import Vendas from "./pages/Vendas";
import Relatorios from "./pages/Relatorios";
import TrocarSenha from "./pages/TrocarSenha";
import { iniciarVigia } from "./lib/inatividade";
import { useAuth } from "./store/auth";

export default function App() {
  const iniciar = useAuth((s) => s.iniciar);
  useEffect(() => iniciar(), [iniciar]);
  const logado = useAuth((s) => !!s.usuario);
  const expirar = useAuth((s) => s.expirarPorInatividade);
  useEffect(() => (logado ? iniciarVigia(() => void expirar()) : undefined), [logado, expirar]);
  return (
    <HashRouter>
      <FaixaAmbiente />
      <Routes>
        <Route path="/cardapio" element={<CardapioPublico />} />
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protegida><Inicio /></Protegida>} />
        <Route path="/trocar-senha" element={<Protegida permitirTroca><TrocarSenha /></Protegida>} />
        <Route path="/pdv" element={<Protegida><Pdv /></Protegida>} />
        <Route path="/produtos" element={<Protegida><Produtos /></Protegida>} />
        <Route path="/eventos" element={<Protegida><Eventos /></Protegida>} />
        <Route path="/turno" element={<Protegida><Turno /></Protegida>} />
        <Route path="/conferencia" element={<Protegida><Conferencia /></Protegida>} />
        <Route path="/vendas" element={<Protegida><Vendas /></Protegida>} />
        <Route path="/relatorios" element={<Protegida><Relatorios /></Protegida>} />
        <Route path="/usuarios" element={<Protegida><Usuarios /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
