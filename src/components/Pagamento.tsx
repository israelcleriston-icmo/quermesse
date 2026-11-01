import QRCode from "qrcode";
import { useMemo, useRef, useState } from "react";
import { gerarPayloadPix, montarMensagem } from "../pix/brcode";
import { brl } from "../lib/dinheiro";
import { novoId } from "../lib/id";
import { comprimirImagem } from "../lib/imagem";
import {
  calcular, centavosParaTexto, lerReais, montarPagamentos, type Entrada,
} from "../lib/pagamento";
import { supabase } from "../lib/supabase";
import { useOnline } from "../lib/useOnline";
import { descartarPix, finalizarVenda, registrarPix, type EventoAtivo } from "../lib/vendas";
import { useAuth } from "../store/auth";
import { totalCentavos, useSacola } from "../store/sacola";
import PainelValores, { type Campo, type Textos } from "./PainelValores";

export interface Conclusao { numero: number; total: number; resumo: string[]; trocoCentavos: number }
type Passo = "valores" | "pix" | "confirmar";
const ROTULO = { dinheiro: "Dinheiro", pix: "Pix", credito: "Crédito", debito: "Débito" } as const;

export default function Pagamento({ evento, aoVoltar, aoConcluir }: {
  evento: EventoAtivo; aoVoltar: () => void; aoConcluir: (c: Conclusao) => void;
}) {
  const { linhas, vendaId, limpar } = useSacola();
  const { usuario } = useAuth();
  const online = useOnline();
  const total = totalCentavos(linhas);
  const lista = Object.values(linhas);

  const [passo, setPasso] = useState<Passo>("valores");
  const [textos, setTextos] = useState<Textos>({ pix: "", credito: "", debito: "", entregue: "" });
  const [pix, setPix] = useState<{ txid: string; payload: string; qr: string } | null>(null);
  const [comprovante, setComprovante] = useState<{ path: string; previa: string } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState("");
  const [confirmaSaida, setConfirmaSaida] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  const entrada = useMemo<Entrada | null>(() => {
    const v = { pix: lerReais(textos.pix), credito: lerReais(textos.credito), debito: lerReais(textos.debito), entregue: lerReais(textos.entregue) };
    return Object.values(v).some((x) => x === null) ? null : (v as Entrada);
  }, [textos]);
  const calculo = entrada ? calcular(total, entrada) : null;

  const mensagem = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");

  function preencher(c: Campo) {
    if (!entrada || !calculo) return;
    if (c === "entregue") return setTextos({ ...textos, entregue: centavosParaTexto(calculo.dinheiro) });
    const outras = entrada.pix + entrada.credito + entrada.debito - entrada[c];
    setTextos({ ...textos, [c]: centavosParaTexto(Math.max(0, total - outras)) });
  }

  async function continuar() {
    if (ocupado || !entrada || !calculo?.pronto || !vendaId) return;
    setErro("");
    if (entrada.pix === 0) return setPasso("confirmar");
    setOcupado("Gerando o QR Code…");
    try {
      const txid = await registrarPix(evento.id, entrada.pix, vendaId);
      const payload = gerarPayloadPix({
        chave: evento.chavePix, valor: entrada.pix / 100, txid, mensagem: montarMensagem(txid, evento.chavePix, evento.nome),
      });
      const qr = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 3, width: 360 });
      setPix({ txid, payload, qr });
      setComprovante(null);
      setPasso("pix");
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setOcupado("");
    }
  }

  async function enviarFoto(arquivo: File | undefined) {
    if (!arquivo || ocupado || !usuario) return;
    setErro("");
    setOcupado("Enviando a foto…");
    try {
      const blob = await comprimirImagem(arquivo, 1024, 0.7);
      const path = `${evento.id}/${usuario.id}/${novoId()}.jpg`;
      const { error } = await supabase.storage.from("comprovantes").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw new Error("Não foi possível enviar a foto. Verifique a conexão e tente de novo.");
      setComprovante({ path, previa: URL.createObjectURL(blob) });
      setPasso("confirmar");
    } catch (e) {
      setErro(mensagem(e));
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
      setConfirmaSaida(false);
      setPasso("valores");
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setOcupado("");
    }
  }

  async function finalizar() {
    if (ocupado || !vendaId || !entrada) return;
    setErro("");
    setOcupado("Finalizando…");
    try {
      const pagamentos = total === 0 ? [] : montarPagamentos(total, entrada, pix && comprovante ? { txid: pix.txid, comprovante: comprovante.path } : undefined);
      const r = await finalizarVenda({ vendaId, eventoId: evento.id, pagamentos, itens: lista.map((l) => ({ ep: l.id, q: l.qtd })) });
      const resumo = lista.map((l) => `${l.qtd}× ${l.nome}`);
      limpar();
      aoConcluir({ numero: r.numero, total, resumo, trocoCentavos: Math.round(r.troco_total * 100) });
    } catch (e) {
      setErro(mensagem(e));
      setOcupado("");
    }
  }

  const botao = "w-full rounded-xl py-4 text-lg font-extrabold disabled:opacity-40";
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-marca-50">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
        <header className="rounded-2xl bg-marca-600 p-4 text-white">
          <p className="text-sm opacity-80">Pagamento · {passo === "valores" ? "1. Valores" : passo === "pix" ? "2. Pix" : "3. Confirmar"}</p>
          <p className="text-3xl font-extrabold">{brl(total)}</p>
        </header>

        {!online && <p className="rounded-lg bg-amber-100 p-2 text-center font-semibold text-amber-800">Sem conexão: aguarde para continuar.</p>}
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 font-medium text-red-700">{erro}</p>}
        {ocupado && <p className="rounded-lg bg-marca-100 p-3 text-center font-semibold text-marca-700">{ocupado}</p>}

        {passo === "valores" && (
          <>
            {total === 0 ? (
              <p className="rounded-xl bg-white p-4 text-center font-semibold">Venda sem valor (cortesia).</p>
            ) : (
              <PainelValores total={total} textos={textos} onTexto={(c, v) => setTextos({ ...textos, [c]: v })} onPreencher={preencher} calculo={calculo} />
            )}
            <div className="mt-auto grid gap-3 pt-2">
              {total === 0 ? (
                <button onClick={finalizar} disabled={!!ocupado || !online} className={`${botao} bg-green-600 text-white`}>Emitir cortesia</button>
              ) : (
                <button onClick={continuar} disabled={!!ocupado || !online || !calculo?.pronto} className={`${botao} bg-green-600 text-white active:bg-green-700`}>
                  {entrada && entrada.pix > 0 ? "Continuar para o Pix" : "Continuar"}
                </button>
              )}
              <button onClick={aoVoltar} disabled={!!ocupado} className={`${botao} bg-white text-marca-700`}>← Voltar à sacola</button>
            </div>
          </>
        )}

        {passo === "pix" && pix && entrada && (
          <>
            <div className="rounded-2xl bg-white p-4 text-center shadow">
              <p className="font-bold text-marca-900">Pix de {brl(entrada.pix)}</p>
              <img src={pix.qr} alt="QR Code do Pix" className="mx-auto my-2 w-full max-w-[320px] rounded-lg bg-white" />
              <p className="font-mono text-lg font-bold tracking-wide text-marca-700">{pix.txid}</p>
              {"clipboard" in navigator && (
                <button onClick={() => void navigator.clipboard.writeText(pix.payload)} className="mt-2 text-sm font-bold text-marca-600 underline">Copiar código Pix</button>
              )}
            </div>
            <p className="text-center text-sm text-slate-600">Confira no celular do cliente: data, hora e valor exatos (atenção a Pix agendado).</p>
            <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { void enviarFoto(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="mt-auto grid gap-3">
              <button onClick={() => fotoRef.current?.click()} disabled={!!ocupado || !online} className={`${botao} bg-green-600 text-white active:bg-green-700`}>📷 Fotografar o comprovante</button>
              <button onClick={() => setConfirmaSaida(true)} disabled={!!ocupado} className={`${botao} border-2 border-red-600 bg-white text-red-700`}>Cliente não pagou</button>
            </div>
          </>
        )}

        {passo === "confirmar" && entrada && calculo && (
          <>
            <ul className="space-y-1 rounded-2xl bg-white p-4 shadow">
              {calculo.dinheiro > 0 && <li className="flex justify-between font-semibold"><span>Dinheiro</span><span>{brl(calculo.dinheiro)}</span></li>}
              {(["credito", "debito", "pix"] as const).filter((f) => entrada[f] > 0).map((f) => (
                <li key={f} className="flex justify-between font-semibold"><span>{ROTULO[f]}</span><span>{brl(entrada[f])}</span></li>
              ))}
            </ul>
            {calculo.troco > 0 && (
              <p className="rounded-2xl bg-amber-100 p-4 text-center text-4xl font-extrabold text-amber-900">TROCO {brl(calculo.troco)}</p>
            )}
            {comprovante && <img src={comprovante.previa} alt="Comprovante" className="mx-auto h-28 rounded-lg object-contain" />}
            <div className="mt-auto grid gap-3">
              <button onClick={finalizar} disabled={!!ocupado || !online} className={`${botao} bg-green-600 text-white active:bg-green-700`}>Finalizar venda</button>
              {pix ? (
                <p className="text-center text-sm text-slate-600">Pix já pago: finalize a venda. Se precisar desfazer, peça ao Conselho.</p>
              ) : (
                <button onClick={() => setPasso("valores")} disabled={!!ocupado} className={`${botao} bg-red-600 text-white`}>Cancelar</button>
              )}
            </div>
          </>
        )}
      </div>

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
