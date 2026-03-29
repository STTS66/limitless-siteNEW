import { AccountProfile } from '../types';

interface InstantCommandContext {
  input: string;
  promptName: string;
  profile: AccountProfile | null;
}

interface InstantCommandResult {
  response: string;
}

function buildHelpResponse(): string {
  return [
    'Команды Limitless:',
    '.help',
    '.helpWL',
    '.version',
    '.jailbreak act',
    '.jailbreak not act',
    '.psettings',
    '.news',
    '.interface',
    '.CC',
    '.setLversion X',
    '.setLversion a',
    '.memoryclean all',
    '.memoryclean last',
  ].join('\n');
}

function buildHelpWithLimitlessResponse(promptName: string): string {
  return [
    `Привет, я ${promptName}.`,
    '',
    'Быстрые функции:',
    '— встроенные команды',
    '— быстрый ответ без ожидания модели',
    '— хранение чатов и профиля по токену',
    '— поддержка через Telegram',
    '',
    'Полезное:',
    '.help — список команд',
    '.psettings — шаблон персональных настроек',
    '.news — последние изменения',
    '.interface — режимы интерфейса',
  ].join('\n');
}

function buildProfileSettingsResponse(profile: AccountProfile | null): string {
  const nickname = profile?.nickname?.trim() || '__';

  return [
    '1-страна - __',
    '2-город - __',
    `3-имя - ${nickname}`,
    '4-возраст - __',
    '5-работа - __',
    '6-класс / курс - __',
    '7-твой характер - __',
    '8-характер ИИ клиента - __',
    '9-доп. информация - __',
    '',
    'edit 1-__, 4-__',
  ].join('\n');
}

function buildNewsResponse(promptName: string): string {
  return [
    `Версия ${promptName}`,
    '',
    'Что нового:',
    '— быстрые локальные ответы на команды',
    '— улучшенный профиль и сохранение данных по токену',
    '— обновленный интерфейс для телефонов и планшетов',
  ].join('\n');
}

function buildInterfaceResponse(): string {
  return [
    'Стандартный интерфейс',
    '.Si изменит интерфейс на стандартный',
    '!BETA! .Gi изменит интерфейс на графический',
  ].join('\n');
}

function buildCustomCommandsResponse(): string {
  return [
    'Меню кастомных команд',
    'Найдено 0 кастомных команд',
    'create C - создать команду',
    'edit C __ - редактировать команду',
    'delete C __ - удалить команду',
    'export C - сгенерировать код всех команд для сохранения',
    'import C [код] - восстановить команды из кода',
  ].join('\n');
}

function buildVersionResponse(promptName: string): string {
  return `Версия ${promptName}`;
}

function buildJailbreakResponse(mode?: string): string {
  if (!mode) {
    return 'jailbreak (act/not act)';
  }

  if (mode === 'act') {
    return 'jailbreak (act)';
  }

  if (mode === 'not act' || mode === 'not_act' || mode === 'notact') {
    return 'jailbreak (not act)';
  }

  return 'Используйте: .jailbreak act или .jailbreak not act';
}

function buildSetVersionResponse(value?: string): string {
  if (!value) {
    return 'Укажите версию: .setLversion X или .setLversion a';
  }

  if (value === 'x') {
    return 'Текущая версия Limitless X';
  }

  if (value === 'a') {
    return 'Текущая версия Limitless a';
  }

  return 'Доступные версии: X, a';
}

function buildMemoryCleanResponse(scope?: string): string {
  if (!scope) {
    return 'Используйте: .memoryclean all или .memoryclean last';
  }

  if (scope === 'all' || scope === 'last') {
    return 'Память успешно очищена';
  }

  return 'Используйте: .memoryclean all или .memoryclean last';
}

export function resolveInstantCommand({
  input,
  promptName,
  profile,
}: InstantCommandContext): InstantCommandResult | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('.')) {
    return null;
  }

  const normalized = trimmed.toLowerCase();
  const [command, ...args] = normalized.split(/\s+/);
  const argsText = args.join(' ').trim();

  switch (command) {
    case '.help':
      return { response: buildHelpResponse() };
    case '.helpwl':
      return { response: buildHelpWithLimitlessResponse(promptName) };
    case '.version':
      return { response: buildVersionResponse(promptName) };
    case '.psettings':
      return { response: buildProfileSettingsResponse(profile) };
    case '.news':
      return { response: buildNewsResponse(promptName) };
    case '.interface':
    case '.si':
    case '.gi':
      return { response: buildInterfaceResponse() };
    case '.cc':
      return { response: buildCustomCommandsResponse() };
    case '.jailbreak':
      return { response: buildJailbreakResponse(argsText) };
    case '.setlversion':
      return { response: buildSetVersionResponse(argsText) };
    case '.memoryclean':
      return { response: buildMemoryCleanResponse(argsText) };
    default:
      return null;
  }
}
