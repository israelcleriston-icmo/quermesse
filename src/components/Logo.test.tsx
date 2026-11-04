// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Logo from "./Logo";

afterEach(cleanup);
describe("Logo", () => {
  it("mostra o ícone do app com texto alternativo e tamanho", () => {
    render(<Logo tamanho={64} />);
    const img = screen.getByAltText("Quermesse") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/icons\/icon-192\.png$/);
    expect(img.width).toBe(64);
  });
});
