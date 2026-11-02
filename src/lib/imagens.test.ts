import { describe, expect, it } from "vitest";
import { sugerirImagem, urlImagem } from "./imagens";

describe("imagens genéricas", () => {
  it("sugere pelo nome, sem depender de acento ou maiúsculas", () => {
    expect(sugerirImagem("Pastel de carne")).toBe("generico/pastel");
    expect(sugerirImagem("Refrigerante lata")).toBe("generico/refrigerante");
    expect(sugerirImagem("SUCO natural")).toBe("generico/suco");
    expect(sugerirImagem("Água mineral")).toBe("generico/agua");
    expect(sugerirImagem("Fatia de bolo")).toBe("generico/bolo");
    expect(sugerirImagem("Rifa do carro")).toBe("generico/rifa");
    expect(sugerirImagem("Café com leite")).toBe("generico/cafe");
  });
  it("sem correspondência ou vazio: nada", () => {
    expect(sugerirImagem("Xyz")).toBeNull();
    expect(sugerirImagem("  ")).toBeNull();
  });
  it("não confunde 'cha' dentro de outra palavra", () => {
    expect(sugerirImagem("Machado")).toBeNull();
  });
  it("genérica aponta para o arquivo do app; vazio vira null", () => {
    expect(urlImagem("generico/pastel")).toBe("/img/produtos/pastel.svg");
    expect(urlImagem(null)).toBeNull();
  });
});
