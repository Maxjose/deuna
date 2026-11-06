import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Política de privacidad · De1na", description: "Cómo De1na recoge, usa y protege tus datos." };

const UPDATED = "5 de noviembre de 2026";

export default function Privacy() {
  return <main className="legal-page">
    <header><Link href="/" className="legal-brand">De<span>1</span>na</Link></header>
    <article>
      <h1>Política de privacidad</h1>
      <p className="muted">Última actualización: {UPDATED}</p>
      <p>De1na es un servicio de viajes en moto que conecta pasajeros con conductores en Mara, estado Zulia (Venezuela), disponible en la web <strong>de1na.app</strong> y en la app para Android. Esta política explica qué datos recogemos, para qué los usamos, con quién los compartimos y cómo puedes eliminarlos.</p>

      <h2>1. Datos que recogemos</h2>
      <ul>
        <li><strong>Cuenta:</strong> correo electrónico, nombre, teléfono de contacto y contraseña (guardada cifrada). Si usas passkeys, una credencial pública de tu dispositivo (nunca tu huella o rostro).</li>
        <li><strong>Viajes:</strong> punto de recogida y destino, ruta, distancia, precio, estado del viaje, valoraciones, mensajes del chat del viaje y motivos de cancelación.</li>
        <li><strong>Ubicación:</strong> para pasajeros, la ubicación que eliges en el mapa. Para conductores, la ubicación precisa del teléfono <strong>solo durante un viaje activo</strong>, también con la app en segundo plano o la pantalla apagada, para que el pasajero vea dónde está su conductor. Se deja de enviar al terminar o cancelar el viaje.</li>
        <li><strong>Pagos:</strong> método elegido (efectivo, pago móvil, Binance Pay o saldo De1na); para pago móvil, banco, teléfono de origen, monto y referencia; para Binance Pay, el ID de la transacción; movimientos de tu saldo De1na. Los conductores registran banco, cédula y teléfono para recibir sus pagos. No guardamos claves bancarias ni datos de tarjetas.</li>
        <li><strong>Dispositivo:</strong> identificador de notificaciones (para enviarte avisos), versión de la app y datos técnicos básicos necesarios para que el servicio funcione.</li>
      </ul>

      <h2>2. Para qué usamos tus datos</h2>
      <p>Si solicitas soporte, guardamos el motivo, el estado de atención y los mensajes para gestionar tu consulta. Solo tu cuenta y el equipo de administración pueden consultar esa conversación. El agente puede ver los datos básicos de tu perfil, el estado del plan, la documentación y el identificador de un viaje activo para ayudarte. El historial de soporte se conserva mientras tengas la cuenta y se elimina al borrarla.</p>
      <p>Los conductores adjuntan Carnet de Circulación, Responsabilidad Civil, Trimestres, Licencia de Conducir y Carta Médica para una revisión manual antes de aceptar viajes. Estos archivos pueden contener datos de identidad, del vehículo y de salud. Se guardan en almacenamiento privado de Supabase, accesible al titular y a administración para esa revisión, y no se muestran a pasajeros u otros conductores. Al reemplazar un archivo se elimina el anterior; al eliminar la cuenta se borran también estos documentos.</p>
      <ul>
        <li>Prestar el servicio: calcular precios, asignar conductores, mostrar la ubicación del conductor y permitir el contacto entre pasajero y conductor.</li>
        <li>Verificar pagos con el banco o con Binance, gestionar el saldo, los reembolsos y las ganancias de los conductores.</li>
        <li>Enviarte notificaciones de tus viajes y, solo si lo aceptas, promociones.</li>
        <li>Seguridad y prevención de abusos (por ejemplo, límites de cancelaciones) y atención de reclamos.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>3. Con quién los compartimos</h2>
      <ul>
        <li><strong>Entre pasajero y conductor de un mismo viaje:</strong> nombre, valoración, teléfono de contacto (solo mientras el viaje está activo) y la ubicación del conductor.</li>
        <li><strong>Proveedores que hacen funcionar el servicio:</strong> Supabase (base de datos y cuentas), Vercel (alojamiento web), Google Firebase (notificaciones), Resend (correos), servicios de mapas y rutas, Banco del Tesoro (verificación de pago móvil) y Binance (verificación de pagos en USDT). Solo reciben lo necesario para su función.</li>
        <li><strong>Autoridades:</strong> cuando la ley lo exija.</li>
      </ul>

      <h2>4. Conservación y seguridad</h2>
      <p>Las comunicaciones viajan cifradas (HTTPS) y el acceso a los datos está restringido por cuenta. Conservamos los datos mientras tengas tu cuenta. El historial de viajes y pagos puede conservarse sin datos de contacto por obligaciones contables, de seguridad o de resolución de reclamos.</p>

      <h2>5. Tus derechos y eliminación de la cuenta</h2>
      <p>Puedes consultar y corregir tus datos en <strong>Cuenta → Tu información</strong>. Puedes eliminar tu cuenta en cualquier momento desde <strong>Cuenta → Seguridad → Eliminar mi cuenta</strong> o desde <Link href="/eliminar-cuenta">de1na.app/eliminar-cuenta</Link>. Al eliminarla borramos tu nombre, correo, teléfono, dispositivos, lugares favoritos y datos de pago guardados; si tienes viajes, estos se conservan anonimizados.</p>

      <h2>6. Permisos de la app Android</h2>
      <ul>
        <li><strong>Ubicación (incluida en segundo plano durante un viaje):</strong> para mostrar al pasajero la posición del conductor y navegar.</li>
        <li><strong>Notificaciones:</strong> avisos de solicitudes y cambios de tus viajes.</li>
        <li><strong>Mantener la pantalla encendida y vibración:</strong> durante la navegación y al tocar botones.</li>
      </ul>

      <h2>7. Menores de edad</h2>
      <p>De1na está dirigida a mayores de 18 años. Los menores solo pueden usar el servicio con la autorización y supervisión de su representante.</p>

      <h2>8. Cambios y contacto</h2>
      <p>Si cambiamos esta política, actualizaremos la fecha de arriba y te avisaremos en la app cuando el cambio sea importante. Para cualquier consulta sobre tus datos escríbenos a <a href="mailto:soporte@de1na.app">soporte@de1na.app</a>.</p>
    </article>
  </main>;
}
