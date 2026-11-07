import { supabase } from "./supabase";

/** Imagens genéricas que acompanham o app (public/img/produtos). Guardadas no banco como "generico/<id>". */
export const GENERICAS: { id: string; nome: string; palavras: string[] }[] = [
  { id: "pastel", nome: "Pastel", palavras: ["pastel"] },
  { id: "coxinha", nome: "Coxinha", palavras: ["coxinha"] },
  { id: "salgado", nome: "Salgado", palavras: ["salgado", "empada", "esfiha", "kibe", "quibe", "enroladinho"] },
  { id: "cachorro-quente", nome: "Cachorro-quente", palavras: ["cachorro", "hot dog", "hotdog"] },
  { id: "espetinho", nome: "Espetinho", palavras: ["espeto", "espetinho", "churrasco", "carne"] },
  { id: "prato", nome: "Prato", palavras: ["prato", "almoco", "janta", "feijoada", "macarrao", "arroz", "galinhada", "refeicao"] },
  { id: "pipoca", nome: "Pipoca", palavras: ["pipoca"] },
  { id: "bolo", nome: "Bolo", palavras: ["bolo", "torta", "fatia", "pave"] },
  { id: "doce", nome: "Doce", palavras: ["doce", "brigadeiro", "bombom", "cocada", "pacoca", "canjica"] },
  { id: "sorvete", nome: "Sorvete", palavras: ["sorvete", "picole", "acai", "gelado"] },
  { id: "refrigerante", nome: "Refrigerante", palavras: ["refri", "refrigerante", "guarana", "coca", "fanta", "lata"] },
  { id: "suco", nome: "Suco", palavras: ["suco", "limonada", "vitamina"] },
  { id: "agua", nome: "Água", palavras: ["agua"] },
  { id: "cerveja", nome: "Cerveja", palavras: ["cerveja", "chopp", "chope"] },
  { id: "cafe", nome: "Café", palavras: ["cafe", "cappuccino", "chocolate quente", "cha"] },
  { id: "rifa", nome: "Rifa", palavras: ["rifa", "sorteio", "bilhete"] },
  { id: "ingresso", nome: "Ingresso", palavras: ["ingresso", "baile", "entrada"] },
  { id: "outros", nome: "Outros", palavras: [] },
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Sugere a imagem genérica pelo nome digitado (ou null se nada combina). */
export function sugerirImagem(nome: string): string | null {
  const n = semAcento(nome);
  if (!n.trim()) return null;
  const achada = GENERICAS.find((g) => g.palavras.some((p) => new RegExp(`(^|[^a-z])${p}`).test(n)));
  return achada ? `generico/${achada.id}` : null;
}

/** URL da imagem: genérica do app ou foto enviada ao Storage (bucket público "produtos"). */
export function urlImagem(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("generico/")) return `/img/produtos/${path.slice("generico/".length)}.svg`;
  return supabase.storage.from("produtos").getPublicUrl(path).data.publicUrl;
}
