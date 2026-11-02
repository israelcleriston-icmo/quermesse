import { describe, expect, it } from "vitest";
import { dimensoes } from "./imagem";

describe("dimensoes", () => {
  it("reduz mantendo a proporção e nunca amplia", () => {
    expect(dimensoes(4000, 3000, 1024)).toEqual({ w: 1024, h: 768 });
    expect(dimensoes(3000, 4000, 1024)).toEqual({ w: 768, h: 1024 });
    expect(dimensoes(800, 600, 1024)).toEqual({ w: 800, h: 600 });
  });
});
