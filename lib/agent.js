// Quem está pedindo o link: robô de prévia, navegador ou aplicativo.

const BOT_RE =
  /(?<!cu)bot\b|bot\/|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegrambot|slackbot|slack-imgproxy|linkedinbot|discordbot|embedly|iframely|skypeuripreview|vkshare|pinterestbot|redditbot|applebot|bingpreview|google-inspectiontool|googleother|headlesschrome|lighthouse|preview/i;

export function isBot(ua) {
  if (!ua) return true;
  return BOT_RE.test(ua);
}

// Navegadores mandam os cabeçalhos Sec-Fetch-*; apps e players normalmente não.
export function isBrowser(req) {
  if (req.headers['sec-fetch-mode'] || req.headers['sec-fetch-dest']) return true;
  return /^Mozilla\//.test(String(req.headers['user-agent'] || ''));
}
