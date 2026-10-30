import { createBrowserClient } from "@supabase/ssr";
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Falta configurar la conexión con Supabase.");
  return createBrowserClient(url, key, {
    auth: { experimental: { passkey: true } },
  });
}
