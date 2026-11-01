export type NoticeKind='success'|'warning'|'error'|'info';
export function noticeKind(message:string):NoticeKind {
 const text=message.toLowerCase();
 if(/no pudimos|no se pudo|error|fall[oó]|no se complet[oó]|no coinciden/.test(text))return 'error';
 if(/guardad|actualiz[oó]|activad|desactivad|creada|revocada|enviad|exitos/.test(text))return 'success';
 if(/escribe|selecciona|elige|permite|debes|revisa|espera|no est[aá]|bloquead|venci[oó]|al menos|confirma/.test(text))return 'warning';
 return 'info';
}
