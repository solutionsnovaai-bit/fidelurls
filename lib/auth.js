import crypto from 'node:crypto';
import { HttpError, parseCookies, requestHost, requestProto } from './http.js';

export const COOKIE = 'fidel_session';
const SESSION_DAYS = 60;

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest();

export function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function secretKey() {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw new HttpError(500, 'Defina a variável ADMIN_PASSWORD na Vercel.');
  return sha256(`fidel-urls:${process.env.SESSION_SECRET || ''}:${pass}`); // trocar a senha derruba as sessões
}

const sign = (payload) => crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url');
const secureFlag = (req) => (requestProto(req) === 'https' ? '; Secure' : '');

export function makeSessionCookie(req) {
  const exp = String(Date.now() + SESSION_DAYS * 86400_000);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureFlag(req)}`;
}

export function clearSessionCookie(req) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;
}

function validSession(token) {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 1) return false;
  const payload = token.slice(0, i);
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(token.slice(i + 1), sign(payload));
}

// Sessão do painel ou chave de automação (variável API_KEY, opcional).
export function authKind(req) {
  if (validSession(parseCookies(req)[COOKIE])) return 'session';
  const key = process.env.API_KEY;
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const given = m ? m[1].trim() : '';
  if (key && given && safeEqual(given, key)) return 'apikey';
  return null;
}

export function requireAuth(req) {
  const kind = authKind(req);
  if (!kind) throw new HttpError(401, 'Faça login para continuar.');
  if (kind === 'session' && !['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
    let host = '';
    try {
      host = new URL(req.headers.origin).host.toLowerCase();
    } catch {}
    if (host !== requestHost(req)) throw new HttpError(403, 'Origem não permitida.');
  }
  return kind;
}
