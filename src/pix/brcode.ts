// Gerador de QR Code Pix ESTÁTICO (BR Code / EMV) — sem dependências.
// Baseado no Manual de Padrões para Iniciação do Pix, seção 2.6.
//
// No nosso sistema só mudam por venda: chave Pix, valor, TXID e mensagem.
// Nome do recebedor e cidade são campos obrigatórios do formato, mas o app do pagador
// mostra o nome vindo do DICT e ignora estes dois: por isso usamos valores fixos.

// ---------------------------------------------------------------------
// Baixo nível
// ---------------------------------------------------------------------

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF). Devolve 4 hex maiúsculos. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Monta um campo TLV: ID (2) + tamanho (2) + valor. */
export function tlv(id: string, valor: string): string {
  if (valor.length > 99) throw new Error(`Campo ${id} excede 99 caracteres (${valor.length}).`);
  return id + String(valor.length).padStart(2, "0") + valor;
}

export interface PayloadBruto {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  /** Texto já formatado (ex.: "5.00"). Omitido = o pagador digita o valor. */
  valor?: string;
  /** infoAdicional (26-02). */
  mensagem?: string;
  /** Reference Label (62-05). Omitido = "***", como no exemplo do manual. */
  txid?: string;
}

/** Monta o payload exatamente na ordem do manual, sem validar nem normalizar. */
export function montarPayload(p: PayloadBruto): string {
  const conta =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", p.chave) +
    (p.mensagem ? tlv("02", p.mensagem) : "");
  const corpo =
    tlv("00", "01") +
    tlv("26", conta) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (p.valor ? tlv("54", p.valor) : "") +
    tlv("58", "BR") +
    tlv("59", p.nomeRecebedor) +
    tlv("60", p.cidade) +
    tlv("62", tlv("05", p.txid ?? "***"));
  const semCrc = corpo + "6304";
  return semCrc + crc16(semCrc);
}

// ---------------------------------------------------------------------
// Leitura (para testes e conferência)
// ---------------------------------------------------------------------

export interface PayloadLido {
  campos: Record<string, string>;
  conta: Record<string, string>;
  adicionais: Record<string, string>;
  crcOk: boolean;
}

function lerTlv(texto: string): Record<string, string> {
  const r: Record<string, string> = {};
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tam = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(tam)) throw new Error("TLV malformado.");
    r[id] = texto.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  return r;
}

export function decodificar(payload: string): PayloadLido {
  const campos = lerTlv(payload);
  const crcOk = payload.slice(-4) === crc16(payload.slice(0, -4));
  return {
    campos,
    conta: campos["26"] ? lerTlv(campos["26"]) : {},
    adicionais: campos["62"] ? lerTlv(campos["62"]) : {},
    crcOk,
  };
}

// ---------------------------------------------------------------------
// Alto nível (o que o app usa)
// ---------------------------------------------------------------------

/** Remove acentos e caracteres fora do ASCII imprimível; compacta espaços. */
export function normalizarTexto(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const TXID_VALIDO = /^[A-Za-z0-9]{1,25}$/;

/** Valores fixos exigidos pelo formato (ignorados pelo app do pagador). */
export const NOME_FIXO = "PAROQUIA";
export const CIDADE_FIXA = "BRASIL";

/** TXID legível: código do evento + "V" + nº da venda no evento (6 dígitos).
 *  Ex.: EVT1V000123. Deve ser idêntico ao gerado pelo servidor (função _txid_da_venda). */
export function montarTxid(codigoEvento: string, numero: number): string {
  if (!/^[A-Z0-9]{1,10}$/.test(codigoEvento)) {
    throw new Error("Código do evento inválido: use 1 a 10 letras maiúsculas ou números.");
  }
  if (!Number.isInteger(numero) || numero < 1 || numero > 999_999) {
    throw new Error("Número da venda deve ser inteiro entre 1 e 999999.");
  }
  return `${codigoEvento}V${String(numero).padStart(6, "0")}`;
}

/** Espaço máximo da mensagem (infoAdicional) dado o tamanho da chave.
 *  Manual 2.6.1: o template 26 tem 99 caracteres, divididos entre GUI, chave e infoAdicional. */
export function limiteMensagem(chave: string): number {
  // 99 - [00+tam+GUI=4+14] - [01+tam=4+chave] - [02+tam=4]
  return 99 - 18 - 4 - chave.length - 4;
}

/** Mensagem = TXID (obrigatório, nunca cortado) + complemento opcional do evento. */
export function montarMensagem(txid: string, chave: string, complemento = ""): string {
  if (!TXID_VALIDO.test(txid)) throw new Error("TXID inválido: use 1 a 25 letras ou números.");
  const limite = limiteMensagem(chave);
  if (limite < txid.length) {
    throw new Error(`Chave Pix longa demais para caber o TXID na mensagem (limite ${limite}).`);
  }
  const extra = normalizarTexto(complemento, 200);
  if (!extra) return txid;
  const sobra = limite - txid.length - 1; // 1 espaço separador
  if (sobra < 1) return txid;
  return `${txid} ${extra.slice(0, sobra)}`.trimEnd();
}

export interface DadosPix {
  chave: string;
  /** Opcionais: por padrão usam NOME_FIXO e CIDADE_FIXA. */
  nomeRecebedor?: string;
  cidade?: string;
  valor: number; // em reais, até 2 casas
  txid: string;
  /** Deve conter o TXID. Use montarMensagem() para garantir. */
  mensagem: string;
}

/** Valor em reais -> "5.00". Recusa zero, negativo e mais de 2 casas decimais. */
export function formatarValor(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Valor deve ser maior que zero.");
  const centavos = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centavos) > 1e-6) throw new Error("Valor com mais de 2 casas decimais.");
  if (centavos > 999_999_999_99) throw new Error("Valor acima do limite.");
  return (centavos / 100).toFixed(2);
}

/** Gera o payload (texto do QR e do "Pix Copia e Cola") com todas as validações. */
export function gerarPayloadPix(d: DadosPix): string {
  const chave = d.chave.trim();
  if (!chave || chave.length > 77) throw new Error("Chave Pix inválida.");
  if (!TXID_VALIDO.test(d.txid)) throw new Error("TXID inválido: use 1 a 25 letras ou números.");
  if (!d.mensagem.includes(d.txid)) throw new Error("A mensagem deve conter o TXID.");
  if (d.mensagem !== normalizarTexto(d.mensagem, 999)) {
    throw new Error("Mensagem com caracteres não permitidos (use só ASCII, sem acentos).");
  }
  if (d.mensagem.length > limiteMensagem(chave)) {
    throw new Error(`Mensagem excede ${limiteMensagem(chave)} caracteres para esta chave.`);
  }
  const nome = normalizarTexto(d.nomeRecebedor ?? NOME_FIXO, 25);
  const cidade = normalizarTexto(d.cidade ?? CIDADE_FIXA, 15);
  if (!nome || !cidade) throw new Error("Nome do recebedor e cidade são obrigatórios.");

  return montarPayload({
    chave,
    nomeRecebedor: nome,
    cidade,
    valor: formatarValor(d.valor),
    txid: d.txid,
    mensagem: d.mensagem,
  });
}
