import { createClient } from "@supabase/supabase-js";
import { AMBIENTE } from "./ambiente";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chave = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const configurado = Boolean(url && chave);

// Chave pública apenas (o RLS protege os dados). storageKey por ambiente evita misturar sessões.
export const supabase = createClient(url ?? "http://localhost", chave ?? "sem-chave", {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: `quermesse-${AMBIENTE}-auth` },
});
