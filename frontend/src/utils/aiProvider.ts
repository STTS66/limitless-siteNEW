import { Message } from '../types';
import { fetchApi } from './api';
import { fetchPromptConfig } from './gemini';

export const AI_PROVIDER_NAME = 'SosiskiBot API';
export const AI_PROVIDER_DOCS_URL = 'https://sosiskibot.ru/dashboard/docs';
export const DEFAULT_CHAT_MODEL_ID = 'gpt-5.2-chat-latest';

export interface AIModelOption {
  id: string;
  label: string;
  description: string;
}

const FALLBACK_CHAT_MODELS: AIModelOption[] = [
  {
    id: 'gpt-5.2-chat-latest',
    label: 'gpt-5.2-chat-latest',
    description: 'Базовая текстовая версия по умолчанию.',
  },
  {
    id: 'gpt-5.4',
    label: 'gpt-5.4',
    description: 'Более сильная версия для сложных ответов.',
  },
  {
    id: 'gpt-4o',
    label: 'gpt-4o',
    description: 'Мультимодальная версия для текста и изображений.',
  },
];

function normalizeModelDescription(model: Record<string, unknown>): string {
  const ownedBy = typeof model.owned_by === 'string' ? model.owned_by.trim() : '';
  const objectType = typeof model.object === 'string' ? model.object.trim() : '';

  if (ownedBy) {
    return `OpenAI-совместимая модель (${ownedBy}).`;
  }

  if (objectType) {
    return `OpenAI-совместимая модель типа ${objectType}.`;
  }

  return 'OpenAI-совместимая модель для текстового чата.';
}

function normalizeModelsPayload(payload: unknown): AIModelOption[] {
  const rawModels = Array.isArray((payload as { data?: unknown[] } | null)?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? payload
      : [];

  const normalized = rawModels
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const model = entry as Record<string, unknown>;
      const id = typeof model.id === 'string' ? model.id.trim() : '';
      if (!id) {
        return null;
      }

      return {
        id,
        label: id,
        description: normalizeModelDescription(model),
      } satisfies AIModelOption;
    })
    .filter((entry): entry is AIModelOption => Boolean(entry));

  return normalized.length > 0 ? normalized : FALLBACK_CHAT_MODELS;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function resolveProviderError(error?: string): string {
  if (!error) {
    return 'Не удалось получить ответ от AI API.';
  }

  const normalized = error.trim();
  const lower = normalized.toLowerCase();

  if (
    normalized === 'AI_PROVIDER_AUTH_FAILED' ||
    lower.includes('invalid api key') ||
    lower.includes('unauthorized')
  ) {
    return 'Неверный API ключ. Проверьте его в настройках.';
  }

  if (
    normalized === 'AI_PROVIDER_RATE_LIMITED' ||
    lower.includes('high demand') ||
    lower.includes('rate limit') ||
    lower.includes('try again later')
  ) {
    return 'Модель сейчас перегружена. Попробуйте еще раз чуть позже.';
  }

  if (
    normalized === 'AI_PROVIDER_UNAVAILABLE' ||
    lower.includes('temporarily unavailable')
  ) {
    return 'AI API временно недоступен. Попробуйте позже.';
  }

  if (normalized === 'AI_PROVIDER_MODELS_PARSE_FAILED') {
    return 'API вернул список моделей в неожиданном формате.';
  }

  if (normalized === 'AI_PROVIDER_RESPONSE_PARSE_FAILED') {
    return 'AI API вернул неожиданный ответ.';
  }

  if (normalized === 'AI_PROVIDER_BAD_REQUEST') {
    return 'Запрос к AI API составлен некорректно.';
  }

  return normalized;
}

export async function fetchAvailableModels(apiKey: string, signal?: AbortSignal): Promise<AIModelOption[]> {
  if (!apiKey.trim()) {
    return FALLBACK_CHAT_MODELS;
  }

  const response = await fetchApi(
    '/api/ai/models',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: apiKey.trim() }),
      signal,
    },
    20000,
  );

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(resolveProviderError(errorPayload?.error));
  }

  const payload = await response.json();
  return normalizeModelsPayload(payload);
}

export async function sendChatCompletion(
  messages: Message[],
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new Error('API ключ не настроен. Откройте настройки и добавьте ключ SosiskiBot API.');
  }

  const promptConfig = await fetchPromptConfig(signal);
  const response = await fetchApi(
    '/api/ai/chat/completions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: trimmedApiKey,
        model: model.trim() || DEFAULT_CHAT_MODEL_ID,
        messages: [
          { role: 'system', content: promptConfig.prompt },
          ...messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        ],
      }),
      signal,
    },
    90000,
  );

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(resolveProviderError(errorPayload?.error));
  }

  const payload = await response.json();
  const content = normalizeMessageContent(payload?.choices?.[0]?.message?.content);
  if (!content.trim()) {
    throw new Error('AI API вернул пустой ответ.');
  }

  return content;
}

export function getFallbackModels(): AIModelOption[] {
  return FALLBACK_CHAT_MODELS;
}
