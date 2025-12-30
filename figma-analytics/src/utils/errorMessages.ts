/**
 * Русифицирует ошибки Supabase Auth
 */
export function translateAuthError(error: any): string {
  if (!error) return "Произошла неизвестная ошибка";
  
  const errorMessage = error.message || String(error);
  const errorCode = error.code || error.status || "";

  // Переводим по коду ошибки (если есть)
  if (errorCode) {
    switch (errorCode) {
      case "invalid_token":
      case "token_expired":
        return "Код истек или неверен. Запросите новый код.";
      case "email_rate_limit_exceeded":
        return "Слишком много запросов. Попробуйте позже.";
      case "email_not_confirmed":
        return "Email не подтвержден. Проверьте почту.";
      case "user_not_found":
        return "Пользователь не найден.";
      case "invalid_credentials":
        return "Неверные данные для входа.";
      case "email_already_exists":
        return "Email уже зарегистрирован.";
      case "weak_password":
        return "Пароль слишком слабый.";
    }
  }

  // Переводим по тексту ошибки
  const lowerMessage = errorMessage.toLowerCase();
  
  if (lowerMessage.includes("token has expired") || lowerMessage.includes("token expired")) {
    return "Код истек. Запросите новый код.";
  }
  
  if (lowerMessage.includes("token") && (lowerMessage.includes("invalid") || lowerMessage.includes("expired"))) {
    return "Код истек или неверен. Запросите новый код.";
  }
  
  if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests")) {
    return "Слишком много запросов. Подождите немного и попробуйте снова.";
  }
  
  if (lowerMessage.includes("email") && lowerMessage.includes("not authorized")) {
    return "Email не авторизован. Обратитесь к администратору.";
  }
  
  if (lowerMessage.includes("email") && lowerMessage.includes("already registered")) {
    return "Email уже зарегистрирован.";
  }
  
  if (lowerMessage.includes("network") || lowerMessage.includes("fetch")) {
    return "Ошибка сети. Проверьте подключение к интернету.";
  }

  // Если не нашли перевод, возвращаем оригинальное сообщение
  return errorMessage;
}

