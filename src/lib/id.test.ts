import { afterEach, describe, expect, it } from "vitest";
import { novoId } from "./id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("novoId", () => {
  const original = crypto.randomUUID;
  afterEach(() => { crypto.randomUUID = original; });

  it("gera UUID v4 válido com crypto.randomUUID", () => {
    expect(novoId()).toMatch(UUID_V4);
  });
  it("gera UUID v4 válido e único sem crypto.randomUUID (http fora de localhost)", () => {
    // @ts-expect-error simula contexto inseguro
    crypto.randomUUID = undefined;
    const ids = new Set(Array.from({ length: 200 }, () => novoId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});
