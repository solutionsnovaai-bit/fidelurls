// Páginas públicas: máscara por iframe (sites https), prévia para robôs e avisos.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleOf(link) {
  if (link.meta_title) return link.meta_title;
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

function ogTags(link, shortUrl) {
  const t = titleOf(link);
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(shortUrl)}">`,
    `<meta property="og:title" content="${esc(t)}">`,
    link.meta_description ? `<meta property="og:description" content="${esc(link.meta_description)}">` : '',
    link.meta_image ? `<meta property="og:image" content="${esc(link.meta_image)}">` : '',
    `<meta name="twitter:card" content="${link.meta_image ? 'summary_large_image' : 'summary'}">`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function maskPage(link, dest, shortUrl) {
  const icon = link.meta_icon ? `<link rel="icon" href="${esc(link.meta_icon)}">` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titleOf(link))}</title>
${icon}
${ogTags(link, shortUrl)}
<meta name="robots" content="noindex">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff}</style>
</head>
<body>
<iframe src="${esc(dest)}" title="${esc(titleOf(link))}" allow="autoplay; camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen; payment; encrypted-media; picture-in-picture" allowfullscreen></iframe>
</body>
</html>`;
}

// Só para robôs de prévia (WhatsApp, Instagram, Telegram...), sem revelar o destino.
export function botPage(link, shortUrl) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titleOf(link))}</title>
${ogTags(link, shortUrl)}
</head>
<body><p>${esc(titleOf(link))}</p></body>
</html>`;
}

function shell(title, text) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(120% 80% at 50% 0%,#1b1c1f 0%,#000 60%);color:#e9e9ec;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px;text-align:center}
  .orb{width:110px;height:110px;margin:0 auto 28px;border-radius:50%;position:relative;
    background:radial-gradient(circle at 35% 30%,#fafafa 0%,#9a9ca3 18%,#2b2c30 55%,#0b0b0c 75%)}
  .orb::after{content:"";position:absolute;inset:-12px;border-radius:50%;border:1px solid rgba(255,255,255,.14);animation:p 3.2s ease-out infinite}
  @keyframes p{from{transform:scale(.9);opacity:.9}to{transform:scale(1.35);opacity:0}}
  @media (prefers-reduced-motion:reduce){.orb::after{animation:none}}
  h1{font-size:26px;margin:0 0 10px;font-weight:650;background:linear-gradient(180deg,#fff,#9a9ca3);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{margin:0;color:#9b9da4;line-height:1.5;max-width:360px}
</style>
</head>
<body><div><div class="orb" aria-hidden="true"></div><h1>${title}</h1><p>${text}</p></div></body>
</html>`;
}

export const notFoundPage = () => shell('Link não encontrado', 'Confere se o endereço foi digitado certinho.');
export const offlinePage = () =>
  shell('Destino fora do ar', 'O endereço por trás desse link não respondeu agora. Tente de novo em alguns instantes.');
