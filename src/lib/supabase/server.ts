import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
export async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Falta configurar la conexión con Supabase.");
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Los componentes de servidor no escriben cookies; proxy refresca la sesión. */
        }
      },
    },
  });
}
