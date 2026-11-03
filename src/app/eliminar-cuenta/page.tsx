import type { Metadata } from "next";
import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { DeleteAccount } from "@/components/delete-account";

export const metadata: Metadata = { title: "Eliminar cuenta · De1na", description: "Cómo eliminar tu cuenta de De1na y qué datos se borran." };
export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  let signedIn = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    try { const { data } = await (await serverClient()).auth.getUser(); signedIn = !!data.user; } catch { /* sin sesión */ }
  }
  return <main className="legal-page">
    <header><Link href="/" className="legal-brand">De<span>1</span>na</Link></header>
    <article>
      <h1>Eliminar tu cuenta de De1na</h1>
      <p>Puedes eliminar tu cuenta y tus datos personales en cualquier momento:</p>
      <ol>
        <li>En la app o en <strong>de1na.app</strong>, entra a <strong>Cuenta → Seguridad</strong>.</li>
        <li>Toca <strong>Eliminar mi cuenta</strong>, escribe <strong>ELIMINAR</strong> y confirma.</li>
      </ol>
      <h2>Qué se borra</h2>
      <p>Tu nombre, correo, teléfono, contraseña y passkeys, dispositivos para notificaciones, lugares favoritos y datos de pago guardados. Si tienes viajes, el historial se conserva <strong>sin tus datos personales</strong> por obligaciones contables y de seguridad. Si nunca hiciste un viaje, la cuenta se borra por completo.</p>
      <h2>Antes de eliminarla</h2>
      <p>No puedes eliminarla si tienes un viaje activo, un saldo pendiente o (conductores) ganancias por cobrar. El saldo De1na disponible se pierde al eliminar la cuenta.</p>
      <div className="legal-action">
        {signedIn ? <DeleteAccount /> : <><p>Inicia sesión para eliminar tu cuenta aquí mismo.</p><Link className="primary" href="/login">Iniciar sesión</Link></>}
      </div>
      <p className="muted">¿No puedes entrar a tu cuenta? Escríbenos a <a href="mailto:soporte@de1na.app">soporte@de1na.app</a> desde el correo de tu cuenta y la eliminamos por ti en un máximo de 30 días. Más detalles en la <Link href="/privacidad">política de privacidad</Link>.</p>
    </article>
  </main>;
}
