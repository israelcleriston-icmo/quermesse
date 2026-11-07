import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

/** permitirTroca = a própria tela de troca de senha (senão ela redirecionaria para si mesma). */
export default function Protegida({ children, permitirTroca = false }: { children: ReactNode; permitirTroca?: boolean }) {
  const { carregando, usuario } = useAuth();
  if (carregando) return <p className="p-8 text-center text-marca-700">Carregando…</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.deveTrocarSenha && !permitirTroca) return <Navigate to="/trocar-senha" replace />;
  return <>{children}</>;
}
