import { create } from "zustand";

export interface LinhaSacola {
  id: string; // evento_produto.id
  nome: string;
  valorCentavos: number;
  qtd: number;
  max: number | null; // estoque conhecido (null = ilimitado)
}

interface Estado {
  /** Gerado ao colocar o 1º item; reaproveitado em reenvios (idempotência da venda). */
  vendaId: string | null;
  linhas: Record<string, LinhaSacola>;
  adicionar: (item: Omit<LinhaSacola, "qtd">) => void;
  diminuir: (id: string) => void;
  limpar: () => void;
}

export const totalCentavos = (linhas: Record<string, LinhaSacola>) =>
  Object.values(linhas).reduce((s, l) => s + l.valorCentavos * l.qtd, 0);

export const totalItens = (linhas: Record<string, LinhaSacola>) =>
  Object.values(linhas).reduce((s, l) => s + l.qtd, 0);

export const useSacola = create<Estado>((set) => ({
  vendaId: null,
  linhas: {},
  adicionar: (item) =>
    set((s) => {
      const atual = s.linhas[item.id];
      const qtd = (atual?.qtd ?? 0) + 1;
      if (item.max !== null && qtd > item.max) return s; // não passa do estoque
      return {
        vendaId: s.vendaId ?? crypto.randomUUID(),
        linhas: { ...s.linhas, [item.id]: { ...item, qtd } },
      };
    }),
  diminuir: (id) =>
    set((s) => {
      const atual = s.linhas[id];
      if (!atual) return s;
      const resto = { ...s.linhas };
      delete resto[id];
      const linhas = atual.qtd > 1 ? { ...resto, [id]: { ...atual, qtd: atual.qtd - 1 } } : resto;
      return { linhas, vendaId: Object.keys(linhas).length ? s.vendaId : null };
    }),
  limpar: () => set({ vendaId: null, linhas: {} }),
}));
