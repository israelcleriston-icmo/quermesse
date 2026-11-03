// Instalar o app na tela inicial.
// Android/Chrome: o navegador avisa (beforeinstallprompt) e o botão dispara o aviso de instalação.
// iPhone/Safari: não existe botão; mostramos o passo a passo (Compartilhar > Adicionar à Tela de Início).
import { useEffect, useState } from "react";

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let adiado: EventoInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  // Ouve desde o carregamento do arquivo: o evento pode chegar antes de a tela existir.
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); adiado = e as EventoInstalacao; avisar(); });
  window.addEventListener("appinstalled", () => { adiado = null; avisar(); });
}

export function jaInstalado(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS recente se apresenta como Mac, mas tem tela de toque
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export type SituacaoInstalar = "instalado" | "botao" | "ios" | "nenhuma";

export function useInstalar(): { situacao: SituacaoInstalar; instalar: () => Promise<void> } {
  const [, forcar] = useState(0);
  useEffect(() => {
    const f = () => forcar((n) => n + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
  const situacao: SituacaoInstalar = jaInstalado() ? "instalado" : adiado ? "botao" : ehIOS() ? "ios" : "nenhuma";
  async function instalar() {
    const e = adiado;
    if (!e) return;
    await e.prompt();
    await e.userChoice.catch(() => undefined);
    adiado = null;            // o navegador só permite usar o aviso uma vez
    avisar();
  }
  return { situacao, instalar };
}

/** Só para testes. */
export function _simularEvento(e: EventoInstalacao | null) { adiado = e; avisar(); }
