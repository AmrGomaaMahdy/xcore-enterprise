import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, errorText } from '@/api/client';

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the CSRF token on unsafe requests', async () => {
    document.cookie = 'xcore_csrftoken=abc123';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    await api.post('/x/', { a: 1 });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-CSRFToken']).toBe('abc123');
    expect(init.credentials).toBe('same-origin');
  });

  it('normalises the error envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: { code: 'maker_checker', message: 'Not allowed', details: {} } }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(api.post('/x/')).rejects.toBeInstanceOf(ApiError);
    await api.post('/x/').catch((e) => expect(errorText(e)).toBe('Not allowed'));
  });
});
