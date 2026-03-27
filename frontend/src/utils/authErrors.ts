export function resolveAuthError(error?: string): string {
  switch (error) {
    case 'TOKEN_NOT_FOUND':
      return 'Этот токен не найден. Получите актуальный токен в Telegram-боте.';
    case 'DEVICE_ALREADY_BOUND':
      return 'На этом устройстве уже активирован другой токен. Смена аккаунта отключена.';
    case 'TOKEN_ALREADY_BOUND':
      return 'Этот токен уже активирован на другом устройстве.';
    case 'DEVICE_ID_REQUIRED':
      return 'Не удалось определить это устройство для активации токена.';
    case 'INVALID_TOKEN_FORMAT':
      return 'Неверный формат токена. Используйте токен из Telegram-бота.';
    case 'SUBSCRIPTION_EXPIRED':
      return 'Срок действия доступа по этому токену закончился. Продлите подписку, чтобы снова войти.';
    case 'SUBSCRIPTION_INACTIVE':
      return 'Подписка по этому токену сейчас не активна. Обратитесь к продавцу или администратору.';
    case 'TOKEN_REVOKED':
      return 'Этот токен был отозван и больше не действует.';
    case 'VALIDATION_UNAVAILABLE':
      return 'Сервер проверки токенов временно недоступен. Попробуйте чуть позже.';
    default:
      return 'Недействительный токен. Получите токен в Telegram-боте.';
  }
}
