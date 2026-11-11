export function authErrorMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'email_not_confirmed') return 'Tu correo aún no está verificado. Abre el correo de confirmación que te enviamos y pulsa el enlace para activar tu cuenta. Revisa también la carpeta de spam y luego vuelve a iniciar sesión.';
  if (code === 'over_email_send_rate_limit') return 'Has solicitado correos demasiado seguido. Revisa tu bandeja de entrada y la carpeta de spam. Si ya recibiste el enlace, úsalo para confirmar tu cuenta o recuperar tu acceso; espera unos minutos antes de solicitar otro.';
  if (code === 'over_request_rate_limit') return 'Has realizado demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.';
  return 'No pudimos completar la solicitud. Revisa tus datos y la conexión o inténtalo más tarde.';
}
