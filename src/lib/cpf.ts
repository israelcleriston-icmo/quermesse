export const limparCpf = (v: string) => v.replace(/\D/g, "");

export function formatarCpf(v: string): string {
  const d = limparCpf(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dig = (base: string, peso: number) => {
    let soma = 0;
    for (const c of base) soma += Number(c) * peso--;
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(cpf.slice(0, 9), 10) === Number(cpf[9]) && dig(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** Mesmo e-mail sintético usado pela Edge Function criar-usuario. */
export const emailDoCpf = (cpf: string) => `${cpf}@cpf.quermesse.app.br`;
