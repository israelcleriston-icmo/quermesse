import { describe, expect, it } from "vitest";
import { dataBR, mascararCpf } from "./gestao";

describe("gestão: formatação", () => {
  it("mascara o CPF e mantém os 5 últimos dígitos", () => {
    expect(mascararCpf("52998224725")).toBe("***.***.247-25");
    expect(mascararCpf("123")).toBe("***");
  });
  it("data brasileira sem deslocar o dia", () => {
    expect(dataBR("2026-11-05")).toBe("05/11/2026");
  });
});
