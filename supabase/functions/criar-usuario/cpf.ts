// Utilitários de CPF. Sem dependências externas.

export function limparCpf(valor: string): string {
  return valor.replace(/\D/g, "");
}

/** Valida formato e dígitos verificadores (rejeita 111.111.111-11 etc.). */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    let peso = pesoInicial;
    for (const c of base) soma += Number(c) * peso--;
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return (
    digito(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    digito(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
}

/** O Supabase Auth exige e-mail; usamos um e-mail sintético derivado do CPF.
 *  O app de login monta o mesmo e-mail a partir do CPF digitado. */
export function emailDoCpf(cpf: string): string {
  return `${cpf}@cpf.quermesse.app.br`;
}
