// Máscara de verdade para IP e sites http: o servidor busca a página no destino
// e entrega pelo seu domínio. Quem acessa nunca vê o IP.
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { requestProto } from './http.js';
import { offlinePage } from './pages.js';

export const PX_COOKIE = 'fidel_px';

const DROP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding',
  'upgrade', 'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security',
  'x-frame-options', 'alt-svc', 'public-key-pins', 'report-to', 'nel',
]);
const FORWARD = [
  'accept', 'accept-language', 'authorization', 'cache-control', 'content-type', 'content-length', 'if-match',
  'if-none-match', 'if-modified-since', 'if-unmodified-since', 'if-range', 'range', 'pragma', 'user-agent',
  'x-requested-with', 'x-csrf-token', 'x-xsrf-token',
];
const MAX_HTML = 10 * 1024 * 1024;

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function originPattern(target) {
  const defPort = target.protocol === 'https:' ? '443' : '80';
  const port = target.port && target.port !== defPort ? `:${escRe(target.port)}` : `(?::${defPort})?`;
  // http://IP:porta, //IP:porta e a forma escapada em JSON (http:\/\/IP:porta)
  return new RegExp(`(?:https?:)?(?:\\\\?/){2}${escRe(target.hostname)}${port}(?![\\w.-])`, 'gi');
}

export function mapLocation(loc, target, prefix) {
  if (!loc) return loc;
  if (loc.startsWith('/') && !loc.startsWith('//')) return prefix + loc;
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(loc)) {
    try {
      const u = new URL(loc, target.origin);
      const sameHost = u.hostname === target.hostname && (u.port || '') === (target.port || '');
      if (sameHost) return prefix + u.pathname + u.search + u.hash;
    } catch {}
  }
  return loc;
}

export function rewriteHtml(html, target, prefix, baseHref) {
  // Caminhos que começam com "/" passam a apontar para dentro do link mascarado.
  let out = html
    .replace(/(\s(?:href|src|action|poster|formaction|data-src|data-href)\s*=\s*)(["'])\/(?![\/])/gi, `$1$2${prefix}/`)
    .replace(/(\s(?:href|src|action|poster|formaction)\s*=\s*)\/(?![\/\s>])/gi, `$1${prefix}/`)
    .replace(/url\(\s*(["']?)\/(?![\/])/gi, `url($1${prefix}/`);
  // Endereços absolutos do destino (http://IP:porta/...) viram o próprio link.
  out = out.replace(originPattern(target), prefix);
  if (baseHref && !/<base\b/i.test(out)) {
    const tag = `<base href="${baseHref}">`;
    if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, (m) => m + tag);
    else out = tag + out;
  }
  return out;
}

function decompress(buf, encoding) {
  const e = (encoding || '').toLowerCase().trim();
  try {
    if (e === 'gzip' || e === 'x-gzip') return zlib.gunzipSync(buf);
    if (e === 'deflate') {
      try {
        return zlib.inflateSync(buf);
      } catch {
        return zlib.inflateRawSync(buf);
      }
    }
    if (e === 'br') return zlib.brotliDecompressSync(buf);
  } catch {}
  return buf;
}

// rest === null: entrada do link (ex.: /nome) -> abre exatamente o destino cadastrado.
// rest string: /nome/qualquer/coisa -> mesmo caminho na raiz do destino.
export function proxy(req, res, { link, rest, search }) {
  return new Promise((resolve) => {
    const target = new URL(link.url);
    const prefix = `/${link.slug}`;
    const entry = rest === null;
    let path;
    if (entry) {
      const u = new URL(link.url);
      for (const [k, v] of new URLSearchParams(search)) u.searchParams.set(k, v);
      path = u.pathname + u.search;
    } else {
      path = `/${rest}${search ? `?${search}` : ''}`;
    }

    const headers = {};
    for (const k of FORWARD) if (req.headers[k] !== undefined) headers[k] = req.headers[k];
    headers.host = target.host;
    headers['accept-encoding'] = 'identity';
    const cookie = (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith('fidel_session=') && !c.startsWith(`${PX_COOKIE}=`))
      .join('; ');
    if (cookie) headers.cookie = cookie;
    if (req.headers.origin) headers.origin = target.origin;
    if (req.headers.referer) {
      try {
        const r = new URL(req.headers.referer);
        const p = r.pathname.startsWith(prefix + '/') ? r.pathname.slice(prefix.length) : r.pathname === prefix ? target.pathname : r.pathname;
        headers.referer = target.origin + p + r.search;
      } catch {}
    }

    const lib = target.protocol === 'https:' ? https : http;
    const up = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        method: req.method,
        path,
        headers,
        rejectUnauthorized: false, // muitos IPs usam certificado próprio
        timeout: 20_000,
      },
      (ur) => {
        const out = {};
        for (const [k, v] of Object.entries(ur.headers)) if (!DROP.has(k)) out[k] = v;
        if (out.location) out.location = mapLocation(String(out.location), target, prefix);
        let cookies = [].concat(ur.headers['set-cookie'] || []).map((c) =>
          c.replace(/;\s*domain=[^;]*/gi, '').replace(/;\s*path=\/(?=;|$)/i, '; Path=/')
        );
        const type = String(ur.headers['content-type'] || '');
        const isHtml = /text\/html|application\/xhtml/i.test(type);
        if (isHtml) {
          const secure = requestProto(req) === 'https' ? '; Secure' : '';
          cookies.push(`${PX_COOKIE}=${encodeURIComponent(link.slug)}; Path=/; Max-Age=86400; SameSite=Lax; HttpOnly${secure}`);
        }
        if (cookies.length) out['set-cookie'] = cookies;
        else delete out['set-cookie'];

        const status = ur.statusCode || 502;
        if (isHtml && req.method !== 'HEAD' && status !== 204 && status !== 304) {
          const chunks = [];
          let size = 0;
          ur.on('data', (c) => {
            size += c.length;
            if (size <= MAX_HTML) chunks.push(c);
          });
          ur.on('end', () => {
            let buf = decompress(Buffer.concat(chunks), ur.headers['content-encoding']);
            const charset = /charset=([^;]+)/i.exec(type)?.[1]?.trim().toLowerCase();
            const latin = charset && /8859|latin|1252/.test(charset);
            let text = buf.toString(latin ? 'latin1' : 'utf8');
            const dir = target.pathname.replace(/[^/]*$/, '') || '/';
            text = rewriteHtml(text, target, prefix, entry ? prefix + dir : null);
            buf = Buffer.from(text, latin ? 'latin1' : 'utf8');
            delete out['content-encoding'];
            delete out['content-length'];
            delete out.etag;
            out['content-length'] = String(buf.length);
            res.writeHead(status, out);
            res.end(buf);
            resolve();
          });
          ur.on('error', () => {
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(offlinePage());
            resolve();
          });
          return;
        }
        res.writeHead(status, out);
        ur.pipe(res);
        ur.on('end', resolve);
        ur.on('error', () => {
          res.end();
          resolve();
        });
      }
    );
    up.on('timeout', () => up.destroy(new Error('timeout')));
    up.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(offlinePage());
      } else res.end();
      resolve();
    });
    if (req.method === 'GET' || req.method === 'HEAD') up.end();
    else req.pipe(up);
  });
}
