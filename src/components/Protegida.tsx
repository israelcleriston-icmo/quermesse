import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../store/auth";

export default function Protegida({ children }: { children: ReactNode }) {
  const { carregando, usuario } = useAuth();
  if (carregando) return <p className="p-8 text-center text-marca-700">Carregando…</p>;
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
