import { brl } from "../lib/dinheiro";
import { totalCentavos, useSacola } from "../store/sacola";

/** Sacola: confere os itens e segue para a tela de pagamento. */
export default function Folha({ aoFechar, aoPagar }: { aoFechar: () => void; aoPagar: () => void }) {
  const { linhas, adicionar, diminuir } = useSacola();
  const lista = Object.values(linhas);
  const total = totalCentavos(linhas);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/60">
      <div className="mx-auto flex max-h-[90%] w-full max-w-md flex-col rounded-t-3xl bg-white p-5">
        <h2 className="mb-2 text-xl font-extrabold text-marca-900">Sacola</h2>
        <ul className="flex-1 divide-y divide-marca-100 overflow-y-auto">
          {lista.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <span className="flex-1 font-semibold">{l.nome}</span>
              <button aria-label={`Menos ${l.nome}`} onClick={() => diminuir(l.id)} className="h-11 w-11 rounded-full bg-marca-100 text-xl font-bold text-marca-700 active:bg-marca-200">−</button>
              <span className="w-6 text-center font-bold">{l.qtd}</span>
              <button aria-label={`Mais ${l.nome}`} onClick={() => adicionar({ id: l.id, nome: l.nome, valorCentavos: l.valorCentavos, max: l.max })} className="h-11 w-11 rounded-full bg-marca-600 text-xl font-bold text-white active:bg-marca-700">+</button>
              <span className="w-24 text-right font-bold">{brl(l.valorCentavos * l.qtd)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between text-2xl font-extrabold text-marca-900"><span>Total</span><span>{brl(total)}</span></p>
        <button onClick={aoPagar} className="mt-4 rounded-xl bg-green-600 py-4 text-lg font-extrabold text-white active:bg-green-700">Ir para o pagamento</button>
        <button onClick={aoFechar} className="py-3 font-semibold text-marca-700">Voltar ao cardápio</button>
      </div>
    </div>
  );
}
