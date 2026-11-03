import { describe, expect, it } from "vitest";
import { validarNovaSenha } from "./senha";

const ok = { atual: "antiga123", nova: "nova-senha-1", confirmacao: "nova-senha-1", cpf: "52998224725" };
describe("validarNovaSenha", () => {
  it("aceita uma senha boa", () => expect(validarNovaSenha(ok)).toBeNull());
  it("exige a senha atual", () => expect(validarNovaSenha({ ...ok, atual: "" })).toMatch(/atual/));
  it("recusa senha curta", () => expect(validarNovaSenha({ ...ok, nova: "curta", confirmacao: "curta" })).toMatch(/pelo menos 8/));
  it("recusa o próprio CPF", () => expect(validarNovaSenha({ ...ok, nova: "52998224725", confirmacao: "52998224725" })).toMatch(/CPF/));
  it("recusa nova igual à atual", () => expect(validarNovaSenha({ ...ok, nova: "antiga123", confirmacao: "antiga123" })).toMatch(/diferente/));
  it("recusa confirmação diferente", () => expect(validarNovaSenha({ ...ok, confirmacao: "outra-coisa" })).toMatch(/confirmação/));
});
