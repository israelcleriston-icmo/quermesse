import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import FaixaAmbiente from "./components/FaixaAmbiente";
import Protegida from "./components/Protegida";
import Inicio from "./pages/Inicio";
import Login from "./pages/Login";
import Pdv from "./pages/Pdv";
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
