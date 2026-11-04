import { AMBIENTE } from "../lib/ambiente";

/** Ícone do Quermesse (no treinamento vem com a etiqueta TREINO). */
export default function Logo({ tamanho = 96, className = "" }: { tamanho?: number; className?: string }) {
  const sufixo = AMBIENTE === "training" ? "-training" : "";
  return (
    <img src={`${import.meta.env.BASE_URL}icons/icon-192${sufixo}.png`} alt="Quermesse" width={tamanho} height={tamanho}
      className={`rounded-[22%] shadow-md ${className}`} />
  );
}
