import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { middleware } from './middleware';

type FetchArgs = [input: string | URL | Request, init?: RequestInit];

function fakeEvent() {
  const pending: Promise<unknown>[] = [];
  const event = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p);
    },
  } as unknown as NextFetchEvent;
  return { event, pending };
}

function request(path = '/', headers: Record<string, string> = {}) {
  return new NextRequest(`https://osiris.example${path}`, {
    headers: { 'user-agent': 'vitest-agent', ...headers },
  });
}

function bodyOf(call: FetchArgs) {
  return JSON.parse(String(call[1]?.body)) as {
    type: string;
    payload: Record<string, unknown>;
  };
}

describe('analytics middleware', () => {
  let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

  beforeEach(() => {
    fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('UMAMI_URL', '');
    vi.stubEnv('UMAMI_WEBSITE_ID', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends nothing when analytics is not configured', async () => {
    const { event, pending } = fakeEvent();
    const res = middleware(request('/', { 'x-forwarded-for': '203.0.113.7' }), event);
    await Promise.all(pending);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pending).toHaveLength(0);
  });

  it('sends nothing when only one of UMAMI_URL / UMAMI_WEBSITE_ID is set', async () => {
    for (const [url, id] of [
      ['http://umami.internal:3000', ''],
      ['', 'site-123'],
    ]) {
      vi.stubEnv('UMAMI_URL', url);
      vi.stubEnv('UMAMI_WEBSITE_ID', id);
      const { event, pending } = fakeEvent();
      middleware(request('/'), event);
      await Promise.all(pending);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when UMAMI_URL is not a valid http(s) URL', async () => {
    vi.stubEnv('UMAMI_URL', 'not a url');
    vi.stubEnv('UMAMI_WEBSITE_ID', 'site-123');
    const { event, pending } = fakeEvent();
    middleware(request('/'), event);
    await Promise.all(pending);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a single page view to the configured endpoint and website id', async () => {
    vi.stubEnv('UMAMI_URL', 'http://umami.internal:3000/');
    vi.stubEnv('UMAMI_WEBSITE_ID', 'site-123');
    const { event, pending } = fakeEvent();
    const res = middleware(
      request('/dashboard', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', referer: 'https://ref.example/' }),
      event,
    );
    await Promise.all(pending);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toBe('http://umami.internal:3000/api/send');
    expect(call[1]?.method).toBe('POST');
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);

    const body = bodyOf(call);
    expect(body.type).toBe('event');
    expect(body.payload.website).toBe('site-123');
    expect(body.payload.url).toBe('/dashboard');
    expect(body.payload.hostname).toBe('osiris.example');
    expect(body.payload.referrer).toBe('https://ref.example/');
    // A page view carries no custom event name or data, and never the IP.
    expect(body.payload).not.toHaveProperty('name');
    expect(body.payload).not.toHaveProperty('data');
    expect(JSON.stringify(body)).not.toContain('203.0.113.7');

    // Client IP is only forwarded as a header, for Umami's own geo lookup.
    const headers = new Headers(call[1]?.headers);
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(headers.get('user-agent')).toBe('vitest-agent');
  });

  it('never sends the visitor-IP "Network Log" event', async () => {
    vi.stubEnv('UMAMI_URL', 'http://umami.internal:3000');
    vi.stubEnv('UMAMI_WEBSITE_ID', 'site-123');
    vi.stubEnv('UMAMI_TRACK_IP', 'true');
    const { event, pending } = fakeEvent();
    middleware(request('/', { 'cf-connecting-ip': '198.51.100.9' }), event);
    await Promise.all(pending);

    for (const call of fetchMock.mock.calls) {
      const body = bodyOf(call);
      expect(body.payload.name).not.toBe('Network Log');
      expect(JSON.stringify(body.payload)).not.toContain('198.51.100.9');
    }
  });

  it('does not throw or reject when the analytics request fails', async () => {
    vi.stubEnv('UMAMI_URL', 'http://umami.internal:3000');
    vi.stubEnv('UMAMI_WEBSITE_ID', 'site-123');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { event, pending } = fakeEvent();
    const res = middleware(request('/'), event);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    await expect(Promise.all(pending)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when fetch throws synchronously', () => {
    vi.stubEnv('UMAMI_URL', 'http://umami.internal:3000');
    vi.stubEnv('UMAMI_WEBSITE_ID', 'site-123');
    fetchMock.mockImplementation(() => {
      throw new TypeError('boom');
    });
    const { event } = fakeEvent();
    expect(() => middleware(request('/'), event)).not.toThrow();
  });
});
