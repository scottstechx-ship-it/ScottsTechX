// Netlify Function: proxies /api/* to the Railway backend.
// If the backend is unreachable, serves the last cached response (for
// public GET endpoints) so the site doesn't blank out when Railway dies.
//
// Path: /.netlify/functions/api/<path>
//
// Env vars:
//   BACKEND_URL       — base URL of the Railway backend, e.g.
//                       https://kalinabiri-backend-production.up.railway.app
//                       (set this in the Netlify dashboard, NOT in code)
//   BACKEND_TIMEOUT_MS — optional, default 4000

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Use the OS temp dir rather than a hard-coded /tmp. /tmp is Linux/Netlify-
// Lambda convention and doesn't resolve on Windows or non-Lambda hosts.
const TMP_ROOT = os.tmpdir();

const CACHE_DIR = '.netlify-functions-cache';
const PUBLIC_GET_PATHS = [
  '/api/announcements',
  '/api/news',
  '/api/gallery',
  '/api/classes',
  '/api/subjects',
  '/api/settings',
];

function safeKey(k) {
  // Strip everything except [a-zA-Z0-9._-] — including `/` and `:`. On
  // Windows, path.join() would otherwise turn a `/` in the cache filename
  // into a `\` and break the file write.
  return k.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
}

async function saveCache(key, value) {
  const dir = path.join(TMP_ROOT, CACHE_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safeKey(key) + '.json'), JSON.stringify(value));
}

async function loadCache(key) {
  try {
    const file = path.join(TMP_ROOT, CACHE_DIR, safeKey(key) + '.json');
    const txt = await fs.readFile(file, 'utf8');
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}

export async function handler(event) {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    return json(500, {
      error: 'BACKEND_URL not configured',
      hint: 'Set BACKEND_URL in the Netlify site env vars',
    });
  }

  // Netlify rewrite turns /api/<x> into /.netlify/functions/api/<x>.
  // We need to forward the FULL path (including /api) to the backend.
  // Derive the upstream path from event.path: strip the function prefix
  // and prepend /api so the backend sees the original request shape.
  const prefix = '/.netlify/functions/api';
  let pathPart;
  if (event.path.startsWith(prefix)) {
    const rest = event.path.slice(prefix.length) || '';
    pathPart = '/api' + (rest.startsWith('/') ? rest : '/' + rest);
  } else {
    // Fallback: caller invoked the function directly. Treat the raw path
    // as the upstream path (assume /api/... is already there).
    pathPart = event.path;
  }

  const targetUrl = backend.replace(/\/$/, '') + pathPart;
  const qs = event.rawQuery ? '?' + event.rawQuery : '';
  const fullUrl = targetUrl + qs;

  const headers = { ...event.headers };
  delete headers.host;
  delete headers['x-forwarded-for'];

  const init = {
    method: event.httpMethod,
    headers,
    body: ['GET', 'HEAD'].includes(event.httpMethod)
      ? undefined
      : (event.body || undefined),
  };

  const timeoutMs = parseInt(process.env.BACKEND_TIMEOUT_MS || '4000', 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  const cacheKey = event.httpMethod + ' ' + pathPart + qs;

  try {
    const res = await fetch(fullUrl, init);
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    if (
      res.ok &&
      event.httpMethod === 'GET' &&
      PUBLIC_GET_PATHS.includes(pathPart)
    ) {
      try {
        await saveCache(cacheKey, { status: res.status, body, contentType });
      } catch (e) {
        console.error('[netlify fn] cache write failed:', e.message);
      }
    }

    return {
      statusCode: res.status,
      headers: { 'content-type': contentType || 'application/json' },
      body,
    };
  } catch (err) {
    clearTimeout(timer);
    if (event.httpMethod === 'GET' && PUBLIC_GET_PATHS.includes(pathPart)) {
      const cached = await loadCache(cacheKey);
      if (cached) {
        return {
          statusCode: cached.status,
          headers: {
            'content-type': cached.contentType,
            'x-cache': 'stale',
            'x-cache-reason': 'backend unreachable: ' + err.message,
          },
          body: cached.body,
        };
      }
    }
    return json(502, { error: 'Backend unreachable', detail: err.message });
  }
}

// Default export for tools that expect it
export default { handler };
