import { describe, expect, it } from "vitest";
import { formatarTelefone, linkWhatsApp, validarTelefoneBR } from "./whatsapp";

describe("whatsapp", () => {
  it("formata enquanto digita", () => {
    expect(formatarTelefone("1")).toBe("(1");
    expect(formatarTelefone("11912")).toBe("(11) 912");
    expect(formatarTelefone("11912345678")).toBe("(11) 91234-5678");
    expect(formatarTelefone("119123456789999")).toBe("(11) 91234-5678");
  });
  it("valida celular com DDD e devolve 55+número", () => {
    expect(validarTelefoneBR("(11) 91234-5678")).toBe("5511912345678");
    expect(validarTelefoneBR("+55 11 91234-5678")).toBe("5511912345678");
  });
  it("recusa número incompleto, sem 9, DDD inválido", () => {
    expect(validarTelefoneBR("91234-5678")).toBeNull();
    expect(validarTelefoneBR("(11) 21234-5678")).toBeNull();
    expect(validarTelefoneBR("(05) 91234-5678")).toBeNull();
    expect(validarTelefoneBR("")).toBeNull();
  });
  it("monta o link com a mensagem codificada", () => {
    expect(linkWhatsApp("5511912345678", "Pix: a b\nc")).toBe("https://wa.me/5511912345678?text=Pix%3A%20a%20b%0Ac");
  });
});
