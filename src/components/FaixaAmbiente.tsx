import { AMBIENTE, ROTULO_AMBIENTE } from "../lib/ambiente";

/** Faixa fixa no topo fora de produção, para ninguém confundir ensaio com a festa. */
export default function FaixaAmbiente() {
  if (AMBIENTE === "prod") return null;
  const cor = AMBIENTE === "training" ? "bg-orange-600 text-white" : "bg-slate-700 text-white";
  return (
    <div className={`sticky top-0 z-50 px-3 py-1 text-center text-xs font-bold tracking-wide ${cor}`}>
      {ROTULO_AMBIENTE[AMBIENTE]}
    </div>
  );
}
