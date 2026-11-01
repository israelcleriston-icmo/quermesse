import { brl } from "../lib/dinheiro";
import { NOTAS, centavosParaTexto, type Calculo } from "../lib/pagamento";

export interface Textos { pix: string; credito: string; debito: string; entregue: string }
export type Campo = keyof Textos;

const input = "w-full rounded-lg border-2 px-3 py-3 text-xl font-bold outline-none focus:border-marca-600";

function Linha({ rotulo, valor, onChange, onResto }: { rotulo: string; valor: string; onChange: (v: string) => void; onResto: () => void }) {
  const ruim = valor.trim() !== "" && !/^\d+([.,]\d{1,2})?$/.test(valor.trim());
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1 text-sm font-semibold text-marca-900">{rotulo}
        <input aria-label={rotulo} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => onChange(e.target.value)}
          className={`${input} mt-1 ${ruim ? "border-red-400" : "border-marca-200"}`} />
      </label>
      <button type="button" onClick={onResto} className="rounded-lg bg-marca-100 px-3 py-3 text-sm font-bold text-marca-700 active:bg-marca-200">Resto</button>
    </div>
  );
}

/** Um campo de valor ao lado de cada forma. O dinheiro é o que sobrar; o troco já considera as outras formas. */
export default function PainelValores({ total, textos, onTexto, onPreencher, calculo }: {
  total: number; textos: Textos; onTexto: (c: Campo, v: string) => void; onPreencher: (c: Campo) => void; calculo: Calculo | null;
}) {
  return (
    <div className="space-y-3">
      <Linha rotulo="Pix" valor={textos.pix} onChange={(v) => onTexto("pix", v)} onResto={() => onPreencher("pix")} />
      <Linha rotulo="Crédito" valor={textos.credito} onChange={(v) => onTexto("credito", v)} onResto={() => onPreencher("credito")} />
      <Linha rotulo="Débito" valor={textos.debito} onChange={(v) => onTexto("debito", v)} onResto={() => onPreencher("debito")} />

      <div className="rounded-xl bg-marca-50 p-3">
        <p className="flex justify-between font-bold text-marca-900">
          <span>Restante em dinheiro</span><span>{calculo ? brl(calculo.dinheiro) : "—"}</span>
        </p>
        <label className="mt-2 block text-sm font-semibold text-marca-900">Dinheiro entregue pelo cliente
          <input aria-label="Dinheiro entregue" inputMode="decimal" placeholder="0,00" value={textos.entregue}
            onChange={(e) => onTexto("entregue", e.target.value)} className={`${input} mt-1 border-marca-200`} />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => onPreencher("entregue")} className="rounded-full bg-white px-3 py-2 text-sm font-bold text-marca-700">Exato</button>
          {NOTAS.map((n) => (
            <button type="button" key={n} onClick={() => onTexto("entregue", centavosParaTexto(n))} className="rounded-full bg-white px-3 py-2 text-sm font-bold text-marca-700">{brl(n)}</button>
          ))}
        </div>
      </div>

      {!calculo && <p className="font-semibold text-red-600">Há um valor inválido. Use números, como 12,50.</p>}
      {calculo?.erro && <p className="font-semibold text-red-600">{calculo.erro}</p>}
      {calculo && !calculo.erro && calculo.falta > 0 && (
        <p className="rounded-xl bg-slate-100 p-3 text-center text-xl font-extrabold text-marca-700">Falta {brl(calculo.falta)} em dinheiro</p>
      )}
      {calculo && !calculo.erro && calculo.troco > 0 && (
        <p className="rounded-xl bg-amber-100 p-4 text-center text-3xl font-extrabold text-amber-900">TROCO {brl(calculo.troco)}</p>
      )}
      {calculo?.pronto && calculo.troco === 0 && total > 0 && (
        <p className="text-center text-lg font-extrabold text-green-700">Pagamento completo ✓</p>
      )}
    </div>
  );
}
