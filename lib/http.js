// Utilitários HTTP sem dependência de framework (funciona na Vercel e no servidor local).

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

export function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

export function html(res, status, markup, headers = {}) {
  send(res, status, markup, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
}

export function redirect(res, location, status = 302) {
  send(res, status, '', {
    Location: location,
    'Cache-Control': 'no-store, max-age=0',
  });
}

export async function readJson(req) {
  // Na Vercel o corpo já vem lido em req.body; localmente lemos o stream.
  let raw;
  if ('body' in req) {
    let b;
    try {
      b = req.body;
    } catch {
      throw new HttpError(400, 'JSON inválido.');
    }
    if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
    if (b !== undefined && b !== null) raw = Buffer.isBuffer(b) ? b.toString('utf8') : String(b);
  }
  if (raw === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new HttpError(413, 'Corpo da requisição grande demais.');
      chunks.push(chunk);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '';
}

export function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim().toLowerCase();
}

export function requestProto(req) {
  const p = req.headers['x-forwarded-proto'];
  if (p) return String(p).split(',')[0].trim();
  return req.socket?.encrypted ? 'https' : 'http';
}

// Endereço público usado para montar os links curtos.
export function baseUrl(req) {
  const env = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (env) return env;
  return `${requestProto(req)}://${requestHost(req)}`;
}

export function baseHost(req) {
  try {
    return new URL(baseUrl(req)).host.toLowerCase();
  } catch {
    return requestHost(req);
  }
}
