// Envio por WhatsApp via link wa.me (abre o app com a mensagem pronta; o número não é guardado).
export const DDI_PADRAO = "55"; // Brasil. Outros países: tela futura.

/** Máscara de exibição: (11) 91234-5678 */
export function formatarTelefone(texto: string): string {
  const n = texto.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 2) return n.length ? `(${n}` : "";
  if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

/** Celular brasileiro com DDD: 11 dígitos, DDD de 11 a 99, 9º dígito = 9. Devolve 55+DDD+número, ou null. */
export function validarTelefoneBR(texto: string, ddi = DDI_PADRAO): string | null {
  let n = texto.replace(/\D/g, "");
  if (n.length === 13 && n.startsWith(ddi)) n = n.slice(2);       // colou já com +55
  if (n.length !== 11) return null;
  const ddd = Number(n.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (n[2] !== "9") return null;
  return `${ddi}${n}`;
}

export function linkWhatsApp(numeroComDdi: string, mensagem: string): string {
  return `https://wa.me/${numeroComDdi}?text=${encodeURIComponent(mensagem)}`;
}
