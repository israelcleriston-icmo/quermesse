// dev = vite dev | training = vite build --mode training | prod = vite build
export type Ambiente = "dev" | "training" | "prod";

export const AMBIENTE: Ambiente =
  import.meta.env.MODE === "training" ? "training" : import.meta.env.MODE === "production" ? "prod" : "dev";

export const ROTULO_AMBIENTE: Record<Ambiente, string> = {
  dev: "DESENVOLVIMENTO",
  training: "TREINAMENTO — dados de teste, nada é real",
  prod: "",
};
