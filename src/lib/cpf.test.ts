import { describe, expect, it } from "vitest";
import { cpfValido, emailDoCpf, formatarCpf } from "./cpf";

describe("cpf", () => {
  it("valida dígitos", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("12345678910")).toBe(false);
  });
  it("formata durante a digitação", () => {
    expect(formatarCpf("5299")).toBe("529.9");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
    expect(formatarCpf("529.982.247-25999")).toBe("529.982.247-25");
  });
  it("e-mail sintético igual ao da Edge Function", () => {
    expect(emailDoCpf("52998224725")).toBe("52998224725@cpf.quermesse.app.br");
  });
});
