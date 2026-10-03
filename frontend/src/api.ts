import { message } from 'antd';

const TOKEN_KEY = 'village_stay_token';
const USER_KEY = 'village_stay_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setSession(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(method: string, path: string, body?: any) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 401) {
    clearSession();
    if (!location.pathname.includes('/login')) location.href = '/login';
    throw new Error('未登录或登录已过期');
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? data.message || '请求失败' : `请求失败(${res.status})`;
    message.error(Array.isArray(msg) ? msg.join('；') : msg);
    throw new Error(msg);
  }
  return data;
}

export const api = {
  get: (p: string) => request('GET', p),
  post: (p: string, b?: any) => request('POST', p, b ?? {}),
  patch: (p: string, b?: any) => request('PATCH', p, b ?? {}),
};

export const fmt = (v: any) => (v == null || v === '' ? '-' : `¥${Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const n = (v: any) => Number(v ?? 0);
