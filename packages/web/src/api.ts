const TOKEN_KEY = 'gas_review_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  raw = false,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data.message === 'string'
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join('；')
          : `请求失败（${res.status}）`;
    throw new Error(message);
  }
  return data as T;
}

/** 取需要鉴权的图片（照片）URL，用一次性 fetch+blob 绕过 <img> 无法带 header 的限制 */
export async function authedPhotoUrl(photoId: number): Promise<string> {
  const res = await api<Response>('GET', `/photos/${photoId}/content`, undefined, true);
  if (!res.ok) throw new Error('照片无法加载');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
