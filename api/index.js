// Fidel URLs — função única: abre os links (redirecionando ou mascarando) e responde ao painel.
import { q } from '../lib/db.js';
import { HttpError, json, html, redirect, readJson, clientIp, baseUrl, baseHost, parseCookies } from '../lib/http.js';
import { authKind, requireAuth, safeEqual, makeSessionCookie, clearSessionCookie } from '../lib/auth.js';
import { serialize, findBySlug, createLink, updateLink, isReserved, canProxy } from '../lib/links.js';
import { maskPage, botPage, notFoundPage } from '../lib/pages.js';
import { proxy, mapLocation, PX_COOKIE } from '../lib/proxy.js';
import { isBot, isBrowser } from '../lib/agent.js';

const API = '/_fidel/api';
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const INTERNAL = ['__r', '__p'];

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://local');
  const params = url.searchParams;
  const qr = params.get('__r');
  const qp = params.get('__p');
  for (const k of INTERNAL) params.delete(k);

  // Caminho original (ou o que o vercel.json repassou, se a plataforma entregar o caminho reescrito).
  let path = url.pathname;
  if (path === '/api/index' || path === '/api') {
    if (qr !== null) path = `${API}/${qr}`;
    else if (qp !== null) path = `/${qp}`;
  }

  if (path === API || path.startsWith(API + '/')) {
    try {
      return await api(req, res, path.slice(API.length), params);
    } catch (err) {
      if (err instanceof HttpError) return json(res, err.status, { error: err.message });
      console.error('[fidel] api', err);
      return json(res, 500, { error: 'Erro interno. Tente de novo em instantes.' });
    }
  }

  try {
    return await open(req, res, path, params);
  } catch (err) {
    console.error('[fidel] open', err);
    if (!res.headersSent) return html(res, 500, notFoundPage(), { 'Cache-Control': 'no-store' });
    res.end();
  }
}

/* ================= abrir um link ================= */

function mergeParams(dest, params) {
  const keys = [...new Set(params.keys())];
  if (!keys.length) return dest;
  const u = new URL(dest);
  for (const k of keys) {
    u.searchParams.delete(k);
    for (const v of params.getAll(k)) u.searchParams.append(k, v);
  }
  return u.toString();
}

async function countClick(link) {
  try {
    await q('update links set clicks = clicks + 1 where id = $1', [link.id]);
  } catch (err) {
    console.error('[fidel] click', err);
  }
}

async function open(req, res, path, params) {
  const noStore = { 'Cache-Control': 'no-store' };
  const search = params.toString();
  const segs = path.split('/'); // ['', 'nome', 'resto'...]
  const first = segs[1] || '';
  const rest = segs.length > 2 ? segs.slice(2).join('/') : null;

  let link = null;
  if (SLUG_RE.test(first) && !isReserved(first)) link = await findBySlug(first);

  if (!link) {
    // Arquivos pedidos pela página mascarada com caminho absoluto (ex.: /css/app.css).
    const px = parseCookies(req)[PX_COOKIE];
    if (px && path !== '/' && isBrowser(req)) {
      const owner = await findBySlug(px);
      if (owner && owner.mask && canProxy(owner.url)) return proxy(req, res, { link: owner, rest: path.slice(1), search });
    }
    return html(res, 404, notFoundPage(), noStore);
  }

  const target = new URL(link.url);
  const entry = rest === null;
  const dest = entry ? mergeParams(link.url, params) : `${target.origin}/${rest}${search ? `?${search}` : ''}`;
  const shortUrl = `${baseUrl(req)}/${link.slug}`;
  const ua = String(req.headers['user-agent'] || '');
  const bot = req.method === 'HEAD' || isBot(ua);
  const human = entry && !bot && !/prefetch/i.test(String(req.headers['sec-purpose'] || req.headers.purpose || ''));

  if (!link.mask) {
    if (human) await countClick(link);
    return redirect(res, dest);
  }

  if (bot && entry) {
    // Prévia no WhatsApp/Instagram sem mostrar o IP de destino.
    const safe = { ...link };
    if (canProxy(link.url)) {
      safe.meta_image = link.meta_image ? mapLocation(link.meta_image, target, shortUrl) : null;
      if (safe.meta_image && !safe.meta_image.startsWith(shortUrl)) safe.meta_image = null;
    }
    return html(res, 200, botPage(safe, shortUrl), { 'Cache-Control': 'public, max-age=300' });
  }

  if (canProxy(link.url)) {
    // IP ou http: navegador recebe o conteúdo pelo nosso domínio; apps e players seguem direto.
    if (isBrowser(req) && !bot) {
      if (human) await countClick(link);
      return proxy(req, res, { link, rest, search });
    }
    return redirect(res, dest);
  }

  // Site https: abre por dentro do link, se o site deixar.
  if (entry && !bot && link.frameable !== false) {
    if (human) await countClick(link);
    return html(res, 200, maskPage(link, dest, shortUrl), noStore);
  }
  if (human) await countClick(link);
  return redirect(res, dest);
}

/* ================= painel ================= */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(req, res, route, params) {
  const parts = route.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const [a, b] = parts;
  const m = req.method;
  const base = baseUrl(req);
  const own = baseHost(req);

  if (a === 'login' && m === 'POST') return login(req, res);
  if (a === 'logout' && m === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie(req) });
  if (a === 'me' && m === 'GET') {
    try {
      return json(res, 200, { authed: Boolean(authKind(req)), base });
    } catch (err) {
      if (err instanceof HttpError) return json(res, 200, { authed: false, base, setup_error: err.message });
      throw err;
    }
  }

  requireAuth(req);

  if (a === 'links' && !b) {
    if (m === 'GET') {
      const { rows } = await q('select * from links order by created_at desc limit 1000');
      return json(res, 200, { items: rows.map((r) => serialize(r, base)) });
    }
    if (m === 'POST') return json(res, 201, serialize(await createLink(await readJson(req), own), base));
  }
  if (a === 'links' && b) {
    if (m === 'PATCH' || m === 'PUT') return json(res, 200, serialize(await updateLink(b, await readJson(req), own), base));
    if (m === 'DELETE') {
      const { rowCount } = await q('delete from links where lower(slug) = lower($1)', [b]);
      if (!rowCount) throw new HttpError(404, 'Link não encontrado.');
      return json(res, 200, { ok: true });
    }
  }
  throw new HttpError(404, 'Rota não encontrada.');
}

async function login(req, res) {
  const ip = clientIp(req) || 'desconhecido';
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) throw new HttpError(500, 'Defina a variável ADMIN_PASSWORD na Vercel.');
  const { rows } = await q(`select count(*)::int as n from auth_fails where ip = $1 and ts > now() - interval '15 minutes'`, [ip]);
  if (rows[0].n >= 8) throw new HttpError(429, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  const body = await readJson(req);
  if (!safeEqual(String(body.password || ''), pass)) {
    await q('insert into auth_fails (ip) values ($1)', [ip]);
    await q(`delete from auth_fails where ts < now() - interval '1 day'`);
    await sleep(500);
    throw new HttpError(401, 'Senha incorreta.');
  }
  await q('delete from auth_fails where ip = $1', [ip]);
  return json(res, 200, { ok: true }, { 'Set-Cookie': makeSessionCookie(req) });
}
