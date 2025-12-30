// Утилиты для валидации данных

/**
 * Валидирует UUID формат
 * @param uuid - строка для проверки
 * @returns true если валидный UUID, false иначе
 */
export function isValidUUID(uuid: string | null | undefined): boolean {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Валидирует UUID и выбрасывает ошибку если невалидный
 * @param uuid - строка для проверки
 * @param fieldName - название поля для сообщения об ошибке
 * @throws Error если UUID невалидный
 */
export function validateUUID(uuid: string | null | undefined, fieldName: string = "UUID"): void {
  if (!isValidUUID(uuid)) {
    throw new Error(`Invalid ${fieldName} format: ${uuid}`);
  }
}

