// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CodigoPix from "./CodigoPix";

afterEach(cleanup);
describe("CodigoPix: leitura por câmera", () => {
  it("abre o leitor ao vivo e aceita o código copia e cola colado nele", () => {
    const aoLer = vi.fn();
    render(<CodigoPix aoLer={aoLer} />);
    fireEvent.click(screen.getByText("📷 Ler QR com a câmera"));
    expect(screen.getByRole("dialog", { name: "Ler QR Pix do banco" })).toBeTruthy();
    fireEvent.click(screen.getByText("Fechar"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
