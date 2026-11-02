import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import FaixaAmbiente from "./components/FaixaAmbiente";
import Protegida from "./components/Protegida";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";
import Pdv from "./pages/Pdv";
import Eventos from "./pages/Eventos";
import Produtos from "./pages/Produtos";
import Usuarios from "./pages/Usuarios";
import { useAuth } from "./store/auth";

export default function App() {
  const iniciar = useAuth((s) => s.iniciar);
  useEffect(() => iniciar(), [iniciar]);
  return (
    <HashRouter>
      <FaixaAmbiente />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protegida><Inicio /></Protegida>} />
        <Route path="/pdv" element={<Protegida><Pdv /></Protegida>} />
        <Route path="/produtos" element={<Protegida><Produtos /></Protegida>} />
        <Route path="/eventos" element={<Protegida><Eventos /></Protegida>} />
        <Route path="/usuarios" element={<Protegida><Usuarios /></Protegida>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
