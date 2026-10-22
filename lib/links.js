import crypto from 'node:crypto';
import { q } from './db.js';
import { HttpError } from './http.js';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const RESERVED = new Set(['api', 'index', 'www', 'admin', 'painel', 'login']);

export const isIp = (host) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(host);

// "Promoção Black Friday!" -> "promocao-black-friday"
export function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

export function isReserved(slug) {
  return RESERVED.has(String(slug).toLowerCase());
}

function randomSlug(len = 6) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function nameToSlug(name) {
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, 'Use letras ou números no nome do link.');
  if (isReserved(slug)) throw new HttpError(400, `O nome "${slug}" é reservado. Escolha outro.`);
  return slug;
}

// Aceita link completo, domínio solto ou IP (com ou sem porta). IP sem http vira http://.
export function normalizeUrl(input, ownHost) {
  let s = String(input || '').trim();
  if (!s) throw new HttpError(400, 'Cole o link ou o IP de destino.');
  if (/^\/\//.test(s)) s = 'http:' + s;
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(javascript|data|vbscript|mailto|tel|sms|file|about|blob):/i.test(s);
  if (!hasScheme) {
    const host = s.split(/[/:?#]/)[0];
    s = (isIp(host) || host === 'localhost' ? 'http://' : 'https://') + s;
  }
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, 'Esse link ou IP não parece válido.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Use um link http(s) ou um IP.');
  const host = u.hostname;
  if (!host || (!host.includes('.') && host !== 'localhost' && !isIp(host))) {
    throw new HttpError(400, 'Esse link ou IP não parece válido.');
  }
  if (ownHost && u.host.toLowerCase() === ownHost) throw new HttpError(400, 'Esse já é um link do Fidel URLs. Cole o destino final.');
  const out = u.toString();
  if (out.length > 4000) throw new HttpError(400, 'O link é longo demais.');
  return out;
}

/* ---------- leitura rápida do destino: título (para a aba do navegador) e se aceita abrir por dentro ---------- */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
function safeChar(c) {
  try {
    return String.fromCodePoint(c);
  } catch {
    return '';
  }
}
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}
function absolutize(href, base) {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return ['http:', 'https:'].includes(u.protocol) ? u.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

export function parseMeta(htmlText, baseUrl) {
  const head = htmlText.slice(0, 400_000);
  const meta = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const key = (a.property || a.name || '').toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content.trim();
  }
  let icon = null;
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const a = attrs(tag);
    const rel = (a.rel || '').toLowerCase();
    if (rel.split(/\s+/).includes('icon') || rel.includes('apple-touch-icon')) icon = absolutize(a.href, baseUrl);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const clean = (s, n) => (s ? decodeEntities(s).replace(/\s+/g, ' ').trim().slice(0, n) || null : null);
  return {
    meta_title: clean(meta['og:title'] || meta['twitter:title'] || (titleTag && titleTag[1]), 300),
    meta_description: clean(meta['og:description'] || meta.description, 600),
    meta_image: absolutize(meta['og:image'] || meta['twitter:image'], baseUrl),
    meta_icon: icon,
  };
}

export function frameAllowed(headers, finalUrl, ownHost) {
  if (!finalUrl.startsWith('https:')) return false;
  if (/deny|sameorigin|allow-from/i.test(headers.get('x-frame-options') || '')) return false;
  const fa = (headers.get('content-security-policy') || '')
    .split(/[;,]/)
    .map((d) => d.trim())
    .find((d) => /^frame-ancestors\b/i.test(d));
  if (!fa) return true;
  const sources = fa.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  if (sources.includes('*')) return true;
  const host = (ownHost || '').split(':')[0];
  return sources.some((src) => {
    const h = src.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
    return h === host || (h.startsWith('*.') && host.endsWith(h.slice(1)));
  });
}

export async function inspectUrl(url, ownHost, timeoutMs = 5000) {
  const empty = { frameable: null, meta_title: null, meta_description: null, meta_image: null, meta_icon: null };
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    const finalUrl = res.url || url;
    const out = { ...empty, frameable: frameAllowed(res.headers, finalUrl, ownHost) };
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (res.body && (type.includes('html') || !type)) {
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < 600_000) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
        if (/<\/head>/i.test(Buffer.concat(chunks).toString('latin1'))) break;
      }
      reader.cancel().catch(() => {});
      const buf = Buffer.concat(chunks);
      const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().toLowerCase();
      let text;
      try {
        text = new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(buf);
      } catch {
        text = buf.toString('utf8');
      }
      Object.assign(out, parseMeta(text, finalUrl));
    }
    return out;
  } catch {
    return empty;
  }
}

/* ---------- banco ---------- */

export function serialize(row, base) {
  if (!row) return null;
  return {
    slug: row.slug,
    short_url: `${base}/${row.slug}`,
    url: row.url,
    mask: row.mask,
    // Máscara funciona sempre para IP e http; para https depende de o site aceitar abrir por dentro.
    mask_ok: canProxy(row.url) || row.frameable !== false,
    title: row.meta_title,
    clicks: Number(row.clicks || 0),
    created_at: row.created_at,
  };
}

export function canProxy(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || isIp(u.hostname);
  } catch {
    return false;
  }
}

export async function findBySlug(slug) {
  const { rows } = await q('select * from links where lower(slug) = lower($1)', [slug]);
  return rows[0] || null;
}

export async function createLink(data, ownHost) {
  const url = normalizeUrl(data.url, ownHost);
  const wanted = data.name !== undefined && data.name !== null && String(data.name).trim() !== '';
  const slugIn = wanted ? nameToSlug(data.name) : null;
  const mask = data.mask === undefined ? true : Boolean(data.mask);
  const meta = await inspectUrl(url, ownHost);
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = slugIn || randomSlug(attempt < 3 ? 6 : 7);
    try {
      const { rows } = await q(
        `insert into links (slug, url, mask, frameable, meta_title, meta_description, meta_image, meta_icon)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [slug, url, mask, meta.frameable, meta.meta_title, meta.meta_description, meta.meta_image, meta.meta_icon]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') {
        if (slugIn) throw new HttpError(409, `O nome "${slugIn}" já está em uso. Escolha outro.`);
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(500, 'Não consegui gerar um nome livre. Tente de novo.');
}

export async function updateLink(slug, data, ownHost) {
  const cur = await findBySlug(slug);
  if (!cur) throw new HttpError(404, 'Link não encontrado.');
  const set = {};
  if (data.url !== undefined) {
    const url = normalizeUrl(data.url, ownHost);
    if (url !== cur.url) Object.assign(set, { url }, await inspectUrl(url, ownHost));
  }
  if (data.name !== undefined) {
    const next = nameToSlug(data.name);
    if (next !== cur.slug) set.slug = next;
  }
  if (data.mask !== undefined) set.mask = Boolean(data.mask);
  const keys = Object.keys(set);
  if (!keys.length) return cur;
  try {
    const { rows } = await q(
      `update links set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1 returning *`,
      [cur.id, ...keys.map((k) => set[k])]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, `O nome "${set.slug}" já está em uso. Escolha outro.`);
    throw err;
  }
}
