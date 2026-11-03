/** Copia texto para a área de transferência. Funciona também em http (fora de localhost), onde navigator.clipboard não existe. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* cai no plano B */ }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
