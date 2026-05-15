import { getBaseUrl } from './strapi-instance';

const ADMIN_CREDENTIALS = {
  email: 'admin@test.com',
  password: 'Admin1234!',
} as const;

let cachedToken: string | null = null;

const request = async (
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; data: unknown }> => {
  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
      ...options.headers,
    },
  });

  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  return { status: response.status, data };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const login = async (retries = 3): Promise<string> => {
  if (cachedToken) return cachedToken;

  for (let attempt = 0; attempt < retries; attempt++) {
    const { status, data } = await request('/admin/login', {
      method: 'POST',
      body: JSON.stringify(ADMIN_CREDENTIALS),
    });

    if (status === 429) {
      const waitMs = (attempt + 1) * 2000;
      console.log(`[api-client] Rate limited, waiting ${waitMs}ms...`);
      await sleep(waitMs);
      continue;
    }

    const token = (data as { data?: { token?: string } })?.data?.token;
    if (!token) {
      throw new Error(`Login failed (${status}): ${JSON.stringify(data)}`);
    }

    cachedToken = token;
    return token;
  }

  throw new Error('Login failed: rate limited after all retries');
};

export const resetAuth = (): void => {
  cachedToken = null;
};

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown) =>
    request(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: (path: string) => request(path, { method: 'DELETE' }),
} as const;
