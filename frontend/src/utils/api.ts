const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

export function getApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`API path must start with "/": ${path}`);
  }

  return `${API_BASE_URL}${path}`;
}
