import QRCode from "qrcode";
import { useRef, useState } from "react";
import EnviarWhatsApp from "./EnviarWhatsApp";
import { copiarTexto } from "../lib/copiar";
import { gerarPayloadPix, montarMensagem } from "../pix/brcode";
import { brl } from "../lib/dinheiro";
import { novoId } from "../lib/id";
import { comprimirImagem } from "../lib/imagem";
import {
  MAX_PARTES, NOTAS, ROTULO_FORMA, centavosParaTexto, faltaCentavos, lerReais, trocoTotalCentavos,
  validarDinheiro, validarParte, type Forma, type PagamentoFinal,
} from "../lib/pagamento";
import { supabase } from "../lib/supabase";
import { useOnline } from "../lib/useOnline";
import { descartarPix, finalizarVenda, registrarPix, type EventoAtivo } from "../lib/vendas";
import { useAuth } from "../store/auth";
import { totalCentavos, useSacola } from "../store/sacola";

export interface Conclusao { numero: number; total: number; resumo: string[]; trocoCentavos: number }

const campo = "mt-1 w-full rounded-lg border-2 border-marca-200 bg-white px-3 py-3 text-xl font-bold outline-none focus:border-marca-600";
const botao = "w-full rounded-xl py-4 text-lg font-extrabold disabled:opacity-40";

export default function Pagamento({ evento, aoVoltar, aoConcluir }: {
  evento: EventoAtivo; aoVoltar: () => void; aoConcluir: (c: Conclusao) => void;
}) {
  const { linhas, vendaId, limpar } = useSacola();
  const { usuario } = useAuth();
  const online = useOnline();
  const total = totalCentavos(linhas);
  const lista = Object.values(linhas);

  const [pagamentos, setPagamentos] = useState<PagamentoFinal[]>([]);
  const [painel, setPainel] = useState<Forma | null>(null);      // forma escolhida, aguardando valor
  const [valorTxt, setValorTxt] = useState("");
  const [entregueTxt, setEntregueTxt] = useState("");
  const [pix, setPix] = useState<{ txid: string; payload: string; qr: string; valor: number } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [confirmaSaida, setConfirmaSaida] = useState(false);
  const [copiado, setCopiado] = useState<"sim" | "falhou" | "">("");
  const [whatsapp, setWhatsapp] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  const falta = faltaCentavos(total, pagamentos);
  const trocoTotal = trocoTotalCentavos(pagamentos);
  const temPix = pagamentos.some((p) => p.forma === "pix");
  const valorC = lerReais(valorTxt);
  const entregueC = lerReais(entregueTxt);
  const vParte = validarParte(falta, valorC);
  const vDin = validarDinheiro(falta, valorC, entregueC);
  const msg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

  function abrir(f: Forma) {
    setPainel(f);
    setValorTxt(centavosParaTexto(falta));
    setEntregueTxt("");
    setErro("");
  }

  function confirmar() {
    if (!painel) return;
    if (painel === "dinheiro") {
      if (!vDin.ok || valorC === null || entregueC === null) return;
      setPagamentos([...pagamentos, { forma: "dinheiro", valorCentavos: valorC, recebidoCentavos: entregueC }]);
    } else {
      if (!vParte.ok || valorC === null) return;
      setPagamentos([...pagamentos, { forma: painel, valorCentavos: valorC }]);
    }
    setPainel(null);
  }

  async function gerarQr() {
    if (ocupado || !vParte.ok || valorC === null || !vendaId) return;
    setErro("");
    setOcupado("Gerando o QR Code…");
    try {
      const txid = await registrarPix(evento.id, valorC, vendaId);
      const payload = gerarPayloadPix({
        chave: evento.chavePix, valor: valorC / 100, txid,
        nomeRecebedor: evento.nomeRecebedor || undefined, cidade: evento.cidadeRecebedor || undefined,
        mensagem: montarMensagem(txid, evento.chavePix, evento.nome),
      });
      const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 3, width: 360 });
      setPix({ txid, payload, qr, valor: valorC });
      setCopiado("");
    } catch (e) {
      setErro(msg(e));
    } finally {
      setOcupado("");
    }
  }

  async function enviarFoto(arquivo: File | undefined) {
    if (!arquivo || ocupado || !usuario || !pix) return;
    setErro("");
    setOcupado("Enviando a foto…");
    try {
      const blob = await comprimirImagem(arquivo, 1024, 0.7);
      const path = `${evento.id}/${usuario.id}/${novoId()}.jpg`;
      const { error } = await supabase.storage.from("comprovantes").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("Não foi possível enviar a foto. Verifique a conexão e tente de novo.");
      setPagamentos([...pagamentos, { forma: "pix", valorCentavos: pix.valor, txid: pix.txid, comprovante: path }]);
      setPix(null);
      setPainel(null);
    } catch (e) {
      setErro(msg(e));
    } finally {
      setOcupado("");
    }
  }

  async function clienteNaoPagou() {
    if (!pix || ocupado) return;
    setOcupado("Registrando…");
    try {
      await descartarPix(pix.txid);
      setPix(null);
      setPainel(null);          // volta a escolher a forma de pagamento
      setConfirmaSaida(false);
    } catch (e) {
      setErro(msg(e));
    } finally {
      setOcupado("");
    }
  }

  async function finalizar() {
    if (ocupado || !vendaId || falta !== 0) return;
    setErro("");
    setOcupado("Finalizando…");
    try {
      const r = await finalizarVenda({ vendaId, eventoId: evento.id, pagamentos, itens: lista.map((l) => ({ ep: l.id, q: l.qtd })) });
      const resumo = lista.map((l) => `${l.qtd}× ${l.nome}`);
      limpar();
      aoConcluir({ numero: r.numero, total, resumo, trocoCentavos: Math.round(r.troco_total * 100) });
    } catch (e) {
      setErro(msg(e));
      setOcupado("");
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <header className="rounded-2xl bg-marca-600 p-4 text-white">
          <p className="text-sm opacity-80">Pagamento · total {brl(total)}</p>
          <p className="text-3xl font-extrabold">{falta === 0 ? "Pago ✓" : `Falta ${brl(falta)}`}</p>
        </header>

        {!online && <p className="rounded-lg bg-amber-100 p-2 text-center font-semibold text-amber-800">Sem conexão: aguarde para continuar.</p>}
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        {ocupado && <p className="rounded-lg bg-marca-100 p-3 text-center font-semibold text-marca-700">{ocupado}</p>}

        {pagamentos.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-white p-3 shadow">
            {pagamentos.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {ROTULO_FORMA[p.forma]} {brl(p.valorCentavos)}
                  {p.forma === "pix" && <span className="text-sm text-green-700"> · comprovante ✓</span>}
                  {p.forma === "dinheiro" && (p.recebidoCentavos ?? 0) > p.valorCentavos && (
                    <span className="text-sm text-marca-700"> · entregou {brl(p.recebidoCentavos!)} · troco {brl(p.recebidoCentavos! - p.valorCentavos)}</span>
                  )}
                </span>
                {p.forma !== "pix" && (
                  <button aria-label={`Remover ${ROTULO_FORMA[p.forma]}`} onClick={() => setPagamentos(pagamentos.filter((_, j) => j !== i))}
                    className="h-10 w-10 shrink-0 rounded-full bg-red-100 text-lg font-bold text-red-700">×</button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* QR do Pix em andamento */}
        {pix && (
          <>
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <p className="font-bold text-marca-900">Pix de {brl(pix.valor)}</p>
              <img src={pix.qr} alt="QR Code do Pix" className="mx-auto my-2 w-full max-w-[320px] rounded-lg bg-white" />
              <p className="font-mono text-lg font-bold tracking-wide text-marca-700">{pix.txid}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={async () => { setCopiado((await copiarTexto(pix.payload)) ? "sim" : "falhou"); }}
                  className="rounded-xl bg-marca-100 py-3 text-sm font-bold text-marca-700 active:bg-marca-200">
                  {copiado === "sim" ? "Copiado ✓" : "Copiar código Pix"}
                </button>
                <button onClick={() => setWhatsapp(true)} className="rounded-xl bg-green-100 py-3 text-sm font-bold text-green-800 active:bg-green-200">Enviar por WhatsApp</button>
              </div>
              {copiado === "falhou" && (
                <label className="mt-2 block text-left text-xs font-semibold">Código Pix Copia e Cola (segure para copiar)
                  <textarea readOnly value={pix.payload} onFocus={(e) => e.currentTarget.select()} rows={4}
                    className="mt-1 w-full rounded-lg border p-2 font-mono text-xs" />
                </label>
              )}
            </div>
            <p className="text-center text-sm text-slate-600">Confira no celular do cliente: data, hora e valor exatos (atenção a Pix agendado).</p>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ""; }} />
            <button onClick={() => fotoRef.current?.click()} disabled={!!ocupado || !online} className={`${botao} bg-green-600 text-white active:bg-green-700`}>📷 Fotografar o comprovante</button>
            <button onClick={() => setConfirmaSaida(true)} disabled={!!ocupado} className={`${botao} border-2 border-red-600 bg-white text-red-700`}>Cliente não pagou</button>
          </>
        )}

        {/* escolher a forma de pagamento */}
        {!pix && !painel && falta > 0 && (
          <>
            <p className="font-semibold text-marca-900">Escolha a forma de pagamento{pagamentos.length ? " do restante" : ""}:</p>
            <div className="grid grid-cols-2 gap-3">
              {(["dinheiro", "pix", "credito", "debito"] as const).map((f) => (
                <button key={f} onClick={() => abrir(f)} disabled={pagamentos.length >= MAX_PARTES || !!ocupado}
                  className={`${botao} bg-marca-600 text-white active:bg-marca-700`}>{ROTULO_FORMA[f]}</button>
              ))}
            </div>
          </>
        )}

        {/* valor da forma escolhida */}
        {!pix && painel && (
          <div className="space-y-3 rounded-2xl border-2 border-marca-200 bg-white p-4">
            <p className="text-lg font-extrabold text-marca-900">{ROTULO_FORMA[painel]}</p>
            <label className="block text-sm font-semibold">Valor desta parte
              <input aria-label="Valor desta parte" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} className={campo} />
            </label>
            {painel === "dinheiro" && (
              <>
                <label className="block text-sm font-semibold">Cliente entregou
                  <input aria-label="Cliente entregou" inputMode="decimal" placeholder="0,00" value={entregueTxt} onChange={(e) => setEntregueTxt(e.target.value)} className={campo} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEntregueTxt(valorTxt)} className="rounded-full bg-marca-100 px-3 py-2 text-sm font-bold text-marca-700">Exato</button>
                  {NOTAS.map((n) => (
                    <button type="button" key={n} onClick={() => setEntregueTxt(centavosParaTexto(n))} className="rounded-full bg-marca-100 px-3 py-2 text-sm font-bold text-marca-700">{brl(n)}</button>
                  ))}
                </div>
                {vDin.ok && vDin.troco > 0 && <p className="rounded-xl bg-amber-100 p-3 text-center text-3xl font-extrabold text-amber-900">TROCO {brl(vDin.troco)}</p>}
                {vDin.erro && <p className="font-semibold text-red-600">{vDin.erro}</p>}
              </>
            )}
            {painel !== "dinheiro" && vParte.erro && <p className="font-semibold text-red-600">{vParte.erro}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setPainel(null)} className={`${botao} bg-slate-200 text-slate-700`}>Voltar</button>
              {painel === "pix" ? (
                <button onClick={gerarQr} disabled={!vParte.ok || !!ocupado || !online} className={`${botao} bg-green-600 text-white`}>Gerar QR Code</button>
              ) : (
                <button onClick={confirmar} disabled={painel === "dinheiro" ? !vDin.ok : !vParte.ok} className={`${botao} bg-green-600 text-white`}>Confirmar</button>
              )}
            </div>
          </div>
        )}

        {/* tudo pago */}
        {!pix && falta === 0 && (
          <>
            {trocoTotal > 0 && <p className="rounded-2xl bg-amber-100 p-4 text-center text-4xl font-extrabold text-amber-900">TROCO {brl(trocoTotal)}</p>}
            <button onClick={finalizar} disabled={!!ocupado || !online} className={`${botao} bg-green-600 text-white active:bg-green-700`}>
              {total === 0 ? "Emitir cortesia" : "Finalizar venda"}
            </button>
          </>
        )}

        {!pix && !painel && (
          <div className="mt-auto grid gap-2 pt-2">
            {pagamentos.length > 0 && !temPix && (
              <button onClick={() => setPagamentos([])} disabled={!!ocupado} className={`${botao} bg-red-600 text-white`}>Cancelar pagamentos</button>
            )}
            {temPix && <p className="text-center text-sm text-slate-600">Há Pix já pago: conclua a venda. Se precisar desfazer, peça ao Conselho.</p>}
            {pagamentos.length === 0 && <button onClick={aoVoltar} disabled={!!ocupado} className={`${botao} bg-white text-marca-700`}>← Voltar à sacola</button>}
          </div>
        )}
      </div>

      {whatsapp && pix && (
        <EnviarWhatsApp aoFechar={() => setWhatsapp(false)}
          mensagem={`Pix ${evento.nome} — ${brl(pix.valor)} (${pix.txid}).\nPix Copia e Cola:\n${pix.payload}`} />
      )}

      {confirmaSaida && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center">
            <p className="text-lg font-bold text-marca-900">Confirma que o cliente NÃO pagou este Pix?</p>
            <p className="mt-1 text-sm text-slate-600">Fica registrado quem confirmou e quando.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setConfirmaSaida(false)} className="rounded-xl bg-slate-200 py-3 font-bold">Voltar</button>
              <button onClick={clienteNaoPagou} disabled={!!ocupado} className="rounded-xl bg-red-600 py-3 font-bold text-white disabled:opacity-40">Sim, não pagou</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
