/**
 * Ders programı algoritması için ortak yardımcı fonksiyonlar.
 * (5-20 words Turkish comment requirement)
 */

// Öğretmen ID'lerini virgül veya boşluklara göre ayıran yardımcı fonksiyon.
export function parseTeacherIds(teacherIdStr: string | null | undefined): string[] {
  if (!teacherIdStr) return [];
  return teacherIdStr
    .split(/[\s,;]+/)
    .map(id => id.trim())
    .filter(Boolean);
}
