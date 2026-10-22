import { Globe } from './globe.js';

const API = '/_fidel/api';
const T0 = performance.now();
// Some com a tela de carregamento depois de pelo menos 0,9s, para o giro aparecer.
function ready() {
  document.body.classList.remove('booting');
  setTimeout(() => document.body.classList.add('loaded'), Math.max(0, 900 - (performance.now() - T0)));
}
// Voltar pelo botão do navegador restaura a página sem recarregar: mostra o load de novo.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  document.body.classList.remove('loaded');
  setTimeout(() => document.body.classList.add('loaded'), 900);
});
const app = document.getElementById('app');
const state = { base: location.origin, links: [], q: '', open: null, globe: null, name: 'Fidel URLs' };
const DEFAULT_NAME = 'Fidel URLs';

// Nome do painel escolhido por quem usa. O padrão mantém o visual de duas cores.
function wordmarkInner(name) {
  return name && name !== DEFAULT_NAME ? `<b>${esc(name)}</b>` : '<b>Fidel</b><span>URLs</span>';
}
function applyName(name) {
  state.name = (name || DEFAULT_NAME).trim() || DEFAULT_NAME;
  document.title = state.name;
  try {
    localStorage.setItem('fidel_name', state.name);
  } catch {}
  const mark = document.querySelector('.ld-mark');
  if (mark) mark.innerHTML = wordmarkInner(state.name);
}

/* ---------- utilidades ---------- */

const ICON = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const myHost = () => state.base.replace(/^https?:\/\//, '');
const bare = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const previewName = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && path !== '/login') {
    renderLogin();
    throw new Error(data.error || 'Faça login de novo.');
  }
  if (!res.ok) throw new Error(data.error || 'Algo deu errado. Tente de novo.');
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) return toast('Segure o link para copiar.', true);
  }
  toast('Link copiado');
}

const busy = (btn, on) => {
  btn.classList.toggle('is-busy', on);
  btn.disabled = on;
};

const maskNote = (l) =>
  l.mask && !l.mask_ok ? '<p class="note">Esse site não deixa ser mascarado; o link vai abrir o site direto.</p>' : '';

function mountGlobe() {
  state.globe?.destroy();
  const c = document.getElementById('globe');
  state.globe = c ? new Globe(c) : null;
}

/* ---------- login ---------- */

function renderLogin(setupError) {
  state.globe?.destroy();
  state.globe = null;
  app.innerHTML = `
    <div class="login">
      <div class="stage"><canvas id="globe" aria-hidden="true"></canvas></div>
      <div class="brand"><h1 class="wordmark">${wordmarkInner(state.name)}</h1></div>
      <form id="login" novalidate>
        ${setupError ? `<p class="note">${esc(setupError)}</p>` : ''}
        <label class="sr-only" for="pw">Senha</label>
        <div class="inline-field">
          <input id="pw" class="input" type="password" placeholder="Senha" autocomplete="current-password">
          <button class="btn btn-ghost btn-icon in-btn" type="button" id="pw-eye" aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button>
        </div>
        <button class="btn btn-chrome btn-big" type="submit"><span class="label">Entrar</span></button>
        <p class="error-text" hidden></p>
      </form>
    </div>`;
  ready();
  mountGlobe();
  const form = document.getElementById('login');
  const err = form.querySelector('.error-text');
  form.querySelector('#pw-eye').addEventListener('click', (e) => {
    const pw = form.querySelector('#pw');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    e.currentTarget.setAttribute('aria-pressed', String(show));
    e.currentTarget.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    busy(btn, true);
    err.hidden = true;
    try {
      await api('/login', { method: 'POST', body: { password: form.querySelector('#pw').value } });
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      busy(btn, false);
    }
  });
  setTimeout(() => form.querySelector('#pw').focus({ preventScroll: true }), 250);
}

/* ---------- estrutura ---------- */

function brandBtnHtml() {
  return `<button class="wordmark brand-btn" id="brand" type="button" aria-label="Trocar o nome do painel">${wordmarkInner(state.name)}<svg class="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>`;
}

function bindBrand() {
  document.getElementById('brand')?.addEventListener('click', renameBrand);
}

function renameBrand() {
  const box = document.getElementById('brandbox');
  if (!box) return;
  box.innerHTML = `
    <form class="rename" id="rename" novalidate>
      <input class="input" id="brand-input" value="${esc(state.name)}" maxlength="40" aria-label="Nome do painel" autocomplete="off" placeholder="Nome do painel">
      <button class="btn btn-chrome" type="submit"><span class="label">OK</span></button>
      <button class="btn btn-ghost" type="button" data-act="cancel" aria-label="Cancelar">✕</button>
    </form>`;
  const form = document.getElementById('rename');
  const input = document.getElementById('brand-input');
  input.focus();
  input.select();
  const restore = () => {
    box.innerHTML = brandBtnHtml();
    bindBrand();
  };
  form.querySelector('[data-act="cancel"]').addEventListener('click', restore);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') restore();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    busy(btn, true);
    try {
      const d = await api('/settings', { method: 'PATCH', body: { name: input.value } });
      applyName(d.name);
      toast('Nome salvo');
      restore();
    } catch (ex) {
      toast(ex.message, true);
      busy(btn, false);
    }
  });
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <span class="brandbox" id="brandbox">${brandBtnHtml()}</span>
      ${state.open ? '' : `<button class="btn btn-ghost btn-icon" type="button" id="logout" aria-label="Sair">${icon('logout')}</button>`}
    </header>
    <div class="wrap">
      <div class="seg tabs" role="tablist" aria-label="Seções">
        <button type="button" role="tab" id="tab-encurtar" data-tab="encurtar" aria-controls="view">Encurtar</button>
        <button type="button" role="tab" id="tab-editar" data-tab="editar" aria-controls="view">Editar</button>
      </div>
      <main id="view" role="tabpanel"></main>
    </div>`;
  bindBrand();
  app.querySelector('#logout')?.addEventListener('click', async () => {
    try {
      await api('/logout', { method: 'POST' });
    } catch {}
    location.hash = '';
    renderLogin();
  });
  app.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) location.hash = b.dataset.tab === 'editar' ? '#/editar' : '#/';
  });
}

function route() {
  if (!document.getElementById('view')) return;
  const tab = location.hash.startsWith('#/editar') ? 'editar' : 'encurtar';
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.getElementById('view').setAttribute('aria-labelledby', `tab-${tab}`);
  if (tab === 'editar') viewEdit();
  else viewShorten();
}

/* ---------- aba Encurtar ---------- */

function viewShorten() {
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="stage"><canvas id="globe" aria-hidden="true"></canvas></div>
    <form class="composer" id="create" novalidate>
      <div class="field">
        <label for="url">Link ou IP de destino</label>
        <div class="inline-field has-wide">
          <input id="url" class="input" type="text" inputmode="url" placeholder="Ex.: 123.45.67.89:8080" autocomplete="off" autocapitalize="off" spellcheck="false">
          <button class="btn btn-ghost in-btn wide" type="button" id="paste">${icon('paste')}Colar</button>
        </div>
      </div>
      <div class="field">
        <label for="name">Nome do link</label>
        <input id="name" class="input" type="text" placeholder="Digite o nome que quiser" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="64">
        <p class="hint" id="slug-hint"></p>
      </div>
      <label class="switch">
        <span class="txt"><b>Mascarar</b><small>O destino abre dentro do seu link, sem mostrar o IP.</small></span>
        <input id="mask" type="checkbox" checked><span class="track" aria-hidden="true"></span>
      </label>
      <button class="btn btn-chrome btn-big" type="submit"><span class="label">Encurtar</span></button>
      <p class="error-text" hidden></p>
    </form>
    <div id="result"></div>`;
  mountGlobe();

  const form = view.querySelector('#create');
  const err = form.querySelector('.error-text');
  const nameInput = form.querySelector('#name');
  const urlInput = form.querySelector('#url');
  const hint = form.querySelector('#slug-hint');
  const updateHint = () => {
    const s = previewName(nameInput.value);
    const taken = Boolean(s) && state.links.some((l) => l.slug.toLowerCase() === s);
    hint.classList.toggle('bad', taken);
    hint.textContent = !s ? '' : taken ? `"${s}" já existe. Escolha outro nome.` : s !== nameInput.value.trim() ? `Vai ficar: ${s}` : '';
  };
  nameInput.addEventListener('input', updateHint);

  const pasteBtn = form.querySelector('#paste');
  if (!navigator.clipboard?.readText) pasteBtn.hidden = true;
  pasteBtn.addEventListener('click', async () => {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (!t) return toast('Não tem nada copiado.', true);
      urlInput.value = t;
      nameInput.focus();
    } catch {
      toast('Não deu para colar. Segure no campo e cole.', true);
    }
  });

  // Link recebido pelo "Compartilhar" do celular (app instalado na tela inicial)
  const sp = new URLSearchParams(location.search);
  const shared = sp.get('url') || (sp.get('text') || '').match(/\S+\.\S+/)?.[0];
  if (shared) {
    urlInput.value = shared;
    history.replaceState(null, '', location.pathname + location.hash);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    const url = urlInput.value.trim();
    if (!url) {
      err.textContent = 'Cole o link ou o IP de destino.';
      err.hidden = false;
      return;
    }
    busy(btn, true);
    try {
      const link = await api('/links', {
        method: 'POST',
        body: { url, name: nameInput.value.trim() || undefined, mask: form.querySelector('#mask').checked },
      });
      state.links.unshift(link);
      state.globe?.fire(4);
      btn.classList.add('sheen');
      setTimeout(() => btn.classList.remove('sheen'), 800);
      copy(link.short_url);
      view.querySelector('#result').innerHTML = resultCard(link);
      bindResult(view.querySelector('#result'), link);
      form.reset();
      updateHint();
      view.querySelector('#result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      busy(btn, false);
    }
  });
}

function resultCard(link) {
  return `
    <div class="result">
      <div class="short chrome-text">${esc(bare(link.short_url))}</div>
      <div class="dest">Abre ${esc(bare(link.url))}${link.mask && link.mask_ok ? ' · mascarado' : ''}</div>
      ${maskNote(link)}
      <div class="actions">
        <button class="btn btn-chrome" type="button" data-act="copy">${icon('copy')}<span class="label">Copiar</span></button>
        ${navigator.share ? `<button class="btn" type="button" data-act="share">${icon('share')}Enviar</button>` : ''}
        <a class="btn" href="${esc(link.short_url)}" target="_blank" rel="noopener">${icon('open')}Abrir</a>
      </div>
      <div class="actions minor">
        <button class="btn btn-ghost" type="button" data-act="new">${icon('plus')}Criar outro</button>
      </div>
    </div>`;
}

function bindResult(root, link) {
  root.querySelector('[data-act="copy"]')?.addEventListener('click', () => copy(link.short_url));
  root.querySelector('[data-act="share"]')?.addEventListener('click', async () => {
    try {
      await navigator.share({ url: link.short_url });
    } catch (err) {
      if (err?.name !== 'AbortError') copy(link.short_url);
    }
  });
  root.querySelector('[data-act="new"]')?.addEventListener('click', () => {
    root.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => document.getElementById('url')?.focus({ preventScroll: true }), 350);
  });
}

/* ---------- aba Editar ---------- */

async function viewEdit() {
  const view = document.getElementById('view');
  view.innerHTML = `
    <div class="search">${icon('search')}<label class="sr-only" for="q">Buscar</label>
      <input id="q" class="input" type="search" placeholder="Buscar por nome ou destino" value="${esc(state.q)}" autocomplete="off"></div>
    <p class="count" id="count"></p>
    <ul class="links" id="links"><li class="empty">Carregando…</li></ul>`;
  view.querySelector('#q').addEventListener('input', (e) => {
    state.q = e.target.value.trim();
    renderList();
  });
  try {
    const d = await api('/links');
    state.links = d.items;
    renderList();
  } catch (ex) {
    const ul = document.getElementById('links');
    if (ul) ul.innerHTML = `<li class="empty">${esc(ex.message)}</li>`;
  }
}

function renderList() {
  const ul = document.getElementById('links');
  if (!ul) return;
  const q = state.q.toLowerCase();
  const list = q
    ? state.links.filter((l) => l.slug.toLowerCase().includes(q) || l.url.toLowerCase().includes(q) || (l.title || '').toLowerCase().includes(q))
    : state.links;
  const count = document.getElementById('count');
  if (count) {
    const total = state.links.length;
    count.textContent = !total ? '' : q ? `${list.length} de ${total}` : `${total} ${total === 1 ? 'link' : 'links'}`;
  }
  if (!list.length) {
    ul.innerHTML = state.q
      ? '<li class="empty">Nada encontrado.</li>'
      : '<li class="empty">Nenhum link ainda. <a href="#/">Criar o primeiro</a></li>';
    return;
  }
  ul.innerHTML = list
    .map((l) =>
      state.open === l.slug
        ? `<li>${editorRow(l)}</li>`
        : `<li class="item"><button class="row" type="button" data-slug="${esc(l.slug)}" aria-label="Editar ${esc(bare(l.short_url))}">
             <span class="s chrome-text">${esc(bare(l.short_url))}</span>
             <span class="d">${esc(bare(l.url))}${l.mask ? '<span class="tag">máscara</span>' : ''}</span>
             <span class="c"><b>${l.clicks}</b>${l.clicks === 1 ? 'acesso' : 'acessos'}</span>
           </button><button class="btn btn-ghost btn-icon quick" type="button" data-copy="${esc(l.short_url)}" aria-label="Copiar ${esc(bare(l.short_url))}">${icon('copy')}</button></li>`
    )
    .join('');
  ul.querySelectorAll('.row').forEach((b) =>
    b.addEventListener('click', () => {
      state.open = b.dataset.slug;
      renderList();
      ul.querySelector('.editor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    })
  );
  ul.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copy)));
  list.forEach((l) => {
    if (state.open === l.slug) bindEditor(ul, l);
  });
}

function editorRow(l) {
  return `
    <form class="editor" data-edit="${esc(l.slug)}" novalidate>
      <div class="field">
        <label>Link ou IP de destino</label>
        <input class="input f-url" type="text" inputmode="url" value="${esc(l.url)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="field">
        <label>Nome do link</label>
        <input class="input f-name" type="text" value="${esc(l.slug)}" maxlength="64" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <label class="switch">
        <span class="txt"><b>Mascarar</b><small>Abrir o destino dentro do link, sem mostrar o IP.</small></span>
        <input class="f-mask" type="checkbox" ${l.mask ? 'checked' : ''}><span class="track" aria-hidden="true"></span>
      </label>
      <div id="edit-note">${maskNote(l)}</div>
      <p class="error-text" hidden></p>
      <div class="actions">
        <button class="btn btn-chrome" type="submit" disabled><span class="label">Salvar</span></button>
        <button class="btn" type="button" data-act="cancel">Cancelar</button>
      </div>
      <div class="actions minor">
        <button class="btn btn-ghost" type="button" data-act="copy">${icon('copy')}Copiar</button>
        <a class="btn btn-ghost" href="${esc(l.short_url)}" target="_blank" rel="noopener">${icon('open')}Abrir</a>
        <button class="btn btn-ghost danger-text" type="button" data-act="del">Excluir</button>
      </div>
    </form>`;
}

function bindEditor(ul, link) {
  const form = ul.querySelector(`[data-edit="${CSS.escape(link.slug)}"]`);
  if (!form) return;
  const err = form.querySelector('.error-text');
  form.querySelector('[data-act="copy"]').addEventListener('click', () => copy(link.short_url));

  // Salvar só acende quando algo mudou; Cancelar ou Esc fecham sem salvar.
  const save = form.querySelector('button[type="submit"]');
  const snapshot = () =>
    [form.querySelector('.f-url').value.trim(), previewName(form.querySelector('.f-name').value), form.querySelector('.f-mask').checked].join('|');
  const initial = snapshot();
  const sync = () => {
    save.disabled = snapshot() === initial;
  };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  const close = () => {
    state.open = null;
    renderList();
  };
  form.querySelector('[data-act="cancel"]').addEventListener('click', close);
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  form.querySelector('[data-act="del"]').addEventListener('click', async (e) => {
    if (!confirm(`Excluir ${bare(link.short_url)}? O link para de funcionar.`)) return;
    busy(e.currentTarget, true);
    try {
      await api(`/links/${encodeURIComponent(link.slug)}`, { method: 'DELETE' });
      state.links = state.links.filter((l) => l.slug !== link.slug);
      state.open = null;
      toast('Link excluído');
      renderList();
    } catch (ex) {
      toast(ex.message, true);
      busy(e.currentTarget, false);
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    busy(btn, true);
    try {
      const updated = await api(`/links/${encodeURIComponent(link.slug)}`, {
        method: 'PATCH',
        body: {
          url: form.querySelector('.f-url').value.trim(),
          name: form.querySelector('.f-name').value.trim(),
          mask: form.querySelector('.f-mask').checked,
        },
      });
      const i = state.links.findIndex((l) => l.slug === link.slug);
      if (i >= 0) state.links[i] = updated;
      state.open = null;
      toast('Alterações salvas');
      renderList();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      busy(btn, false);
    }
  });
}

/* ---------- início ---------- */

async function boot() {
  let me;
  try {
    me = await api('/me');
  } catch (ex) {
    app.innerHTML = `<div class="login"><p class="note" style="align-self:center">${esc(ex.message)}</p></div>`;
    ready();
    return;
  }
  applyName(me.name);
  if (!me.authed) return renderLogin(me.setup_error);
  state.base = me.base || location.origin;
  state.open = Boolean(me.open);
  // Lista carregada logo de cara para avisar nome repetido já na aba Encurtar.
  api('/links')
    .then((d) => {
      state.links = d.items;
    })
    .catch(() => {});
  renderShell();
  route();
  ready();
}

window.addEventListener('hashchange', route);
boot();
