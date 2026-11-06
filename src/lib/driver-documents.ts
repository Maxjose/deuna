export const DOCUMENTS = [
  ['circulation','Carnet de Circulación'],['liability','Responsabilidad Civil'],
  ['quarters','Trimestres'],['license','Licencia de Conducir'],['medical','Carta Médica'],
] as const;
export function documentExtension(file: { type: string; size: number }) {
  if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('El archivo debe pesar entre 1 byte y 10 MB.');
  const extension = ({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'} as Record<string,string>)[file.type];
  if (!extension) throw new Error('Selecciona una imagen JPG, PNG o un PDF.');
  return extension;
}
