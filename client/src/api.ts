const TOKEN_KEY = 'gas_token';
const USER_KEY = 'gas_user';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, user: unknown) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function loadUser<T>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !getToken()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = Array.isArray(data.message) ? data.message.join('；') : data.message;
    throw new ApiError(res.status, msg ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

/** 带鉴权的图片 URL：SVG 照片接口需要令牌，转为 blob URL 供 <img> 使用 */
export async function fetchPhotoBlob(path: string): Promise<string> {
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new ApiError(res.status, '照片加载失败');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
