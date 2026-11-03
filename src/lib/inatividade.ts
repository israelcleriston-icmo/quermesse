// Encerra a sessão depois de um tempo sem uso (o aparelho do caixa pode ficar esquecido aberto).
export const LIMITE_MS = 3 * 60 * 60 * 1000; // 3 horas
const CHAVE = "quermesse-ultima-atividade";
const GRAVAR_NO_MAXIMO_A_CADA_MS = 30_000;

let ultimaGravacao = 0;

/** Verdadeiro se passou do limite desde a última atividade. Sem registro = não expirou (sessão nova). */
export function expirou(agora = Date.now(), limite = LIMITE_MS): boolean {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return v > 0 && agora - v > limite;
  } catch {
    return false;
  }
}

export function registrarAtividade(agora = Date.now(), forcar = false): void {
  if (!forcar && agora - ultimaGravacao < GRAVAR_NO_MAXIMO_A_CADA_MS) return;
  ultimaGravacao = agora;
  try { localStorage.setItem(CHAVE, String(agora)); } catch { /* sem armazenamento: segue sem vigia */ }
}

export function limparAtividade(): void {
  ultimaGravacao = 0;
  try { localStorage.removeItem(CHAVE); } catch { /* ignora */ }
}

/** Liga o vigia; devolve a função que o desliga. aoExpirar roda uma vez quando passa do limite. */
export function iniciarVigia(aoExpirar: () => void, limite = LIMITE_MS): () => void {
  const sinal = () => registrarAtividade();
  const checar = () => { if (expirou(Date.now(), limite)) aoExpirar(); };
  const eventos = ["pointerdown", "keydown", "touchstart"] as const;
  eventos.forEach((e) => window.addEventListener(e, sinal, { passive: true }));
  const aoVoltar = () => { if (document.visibilityState === "visible") checar(); };
  document.addEventListener("visibilitychange", aoVoltar);
  const timer = window.setInterval(checar, 60_000);
  registrarAtividade(Date.now(), true);
  return () => {
    eventos.forEach((e) => window.removeEventListener(e, sinal));
    document.removeEventListener("visibilitychange", aoVoltar);
    window.clearInterval(timer);
  };
}
