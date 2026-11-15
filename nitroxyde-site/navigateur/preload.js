const { contextBridge, ipcRenderer } = require('electron');

// Seules nos pages locales reçoivent un pont ; un site web n'obtient rien.
if (location.protocol === 'file:') {
  const p = location.pathname, theme = cb => ipcRenderer.on('theme', (_, d) => cb(d));
  const page = x => p.endsWith('/src/' + x);
  if (page('index.html')) {
    contextBridge.exposeInMainWorld('nx', {
      os: process.platform,
      nav: (cmd, arg) => ipcRenderer.invoke('nav', cmd, arg),
      onState: cb => ipcRenderer.on('state', (_, s) => cb(s)),
      onTheme: theme,
      onMusic: cb => ipcRenderer.on('music', (_, m) => cb(m)),
      onExtra: cb => ipcRenderer.on('extra', (_, n) => cb(n)),
      onSideW: cb => ipcRenderer.on('sidew', (_, n) => cb(n)),
      onFocusUrl: cb => ipcRenderer.on('focus-url', () => cb()),
      onUrlBlur: cb => ipcRenderer.on('url-blur', () => cb()),
      onFind: cb => ipcRenderer.on('find', (_, m) => cb(m)),
    });
  } else if (page('pages.html') || page('newtab.html') || page('welcome.html') || page('side.html')) {
    contextBridge.exposeInMainWorld('nxp', (cmd, arg) => ipcRenderer.invoke('pg', cmd, arg));
    contextBridge.exposeInMainWorld('nxt', theme);
  } else if (page('toast.html')) {
    contextBridge.exposeInMainWorld('nxt', theme);
    contextBridge.exposeInMainWorld('nxo', {
      onToast: cb => ipcRenderer.on('toast', (_, d) => cb(d)),
      onHide: cb => ipcRenderer.on('toast-hide', () => cb()),
      answer: (id, v, text) => ipcRenderer.send('toast-answer', id, v, text),
    });
  } else if (page('aibar.html')) {
    contextBridge.exposeInMainWorld('nxt', theme);
    contextBridge.exposeInMainWorld('nxb', {
      call: (cmd, arg) => ipcRenderer.invoke('ai', cmd, arg),
      on: cb => ipcRenderer.on('aib', (_, m) => cb(m)),
    });
  } else if (page('ai.html')) {
    contextBridge.exposeInMainWorld('nxt', theme);
    contextBridge.exposeInMainWorld('nxa', {
      call: (cmd, arg) => ipcRenderer.invoke('ai', cmd, arg),
      on: cb => ipcRenderer.on('ai', (_, m) => cb(m)),
    });
  } else if (page('tabsearch.html')) {
    contextBridge.exposeInMainWorld('nxt', theme);
    contextBridge.exposeInMainWorld('nxk', {
      call: (cmd, arg) => ipcRenderer.invoke('ts', cmd, arg),
      onOpen: cb => ipcRenderer.on('ts-open', () => cb()),
    });
  } else if (page('popup.html')) {
    contextBridge.exposeInMainWorld('nxt', theme);
    contextBridge.exposeInMainWorld('nxm', {
      call: (cmd, arg) => ipcRenderer.invoke('pop', cmd, arg),
      onOpen: cb => ipcRenderer.on('pop-open', (_, kind, data) => cb(kind, data)),
    });
  }
} else if (/^https?:$/.test(location.protocol) && window === window.top) {
  // ---- Mots de passe (monde isolé : le site ne voit ni ce code ni les échanges avec le navigateur) ----
  // Remplissage seulement après un clic de l'utilisateur sur la suggestion ; rien n'est exposé à la page.
  const pwFields = () => [...document.querySelectorAll('input[type=password]')].filter(i => i.offsetParent && !i.disabled && !i.readOnly);
  const userField = pw => {
    const scope = pw.form || pw.closest('form,[role=dialog],main,section,div') || document;
    const ins = [...scope.querySelectorAll('input')].filter(i => i.offsetParent && /^(text|email|tel|)$/.test(i.type) && !/search|code|otp|captcha/i.test(i.name + i.id + i.autocomplete));
    const before = ins.filter(i => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before[before.length - 1] || ins[0] || null;
  };
  const setVal = (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  let sent = '';
  const capture = pw => {
    if (!pw || !pw.value || pw.value === sent) return;
    const all = pwFields();
    if (all.length > 1 && all.filter(f => f.value).length > 1 && new Set(all.map(f => f.value)).size > 1) return;   // changement de mot de passe : ancien ≠ nouveau, on ne devine pas
    sent = pw.value;
    ipcRenderer.send('pw-save', { user: userField(pw)?.value || '', pass: pw.value });
  };
  addEventListener('submit', e => capture(e.target.querySelector?.('input[type=password]')), true);
  addEventListener('keydown', e => { if (e.key === 'Enter' && e.target?.type === 'password') capture(e.target); }, true);
  addEventListener('click', e => {
    const b = e.target?.closest?.('button,[type=submit],[role=button]');
    if (!b || b.type === 'reset') return;
    const txt = [b.textContent, b.value, b.getAttribute('aria-label'), b.id, b.name].join(' ');
    if (b.type !== 'submit' && !/connex|connect|log\s?in|sign\s?in|valider|continuer|suivant|next|submit|entrer|envoyer|s'inscrire|inscri|register|create/i.test(txt)) return;
    const pw = pwFields().find(f => f.value);
    if (pw) setTimeout(() => capture(pw), 0);
  }, true);

  // Suggestion sous le champ : « 🔑 compte » ; un clic remplit identifiant + mot de passe
  let box = null, accounts = null;
  const hide = () => { box?.remove(); box = null; };
  const show = async field => {
    accounts ??= await ipcRenderer.invoke('pw', 'accounts').catch(() => null);
    if (!accounts?.length) return;
    hide();
    const r = field.getBoundingClientRect();
    box = document.createElement('div');
    const sh = box.attachShadow({ mode: 'closed' });
    sh.innerHTML = '<style>:host{all:initial}div{font:13px system-ui,sans-serif;background:#111318;color:#eef2f7;border:1px solid #2a2f3a;border-radius:10px;box-shadow:0 10px 30px #0008;padding:4px;min-width:220px}button{display:flex;gap:8px;align-items:center;width:100%;padding:8px 10px;border:0;border-radius:7px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}button:hover{background:#232833}small{display:block;padding:4px 10px 2px;color:#7c8594;font-size:11px}</style><div><small>Nitroxyde · mots de passe enregistrés</small></div>';
    for (const u of accounts.slice(0, 6)) {
      const b = document.createElement('button');
      b.textContent = '🔑  ' + (u || '(sans identifiant)');
      b.onmousedown = async ev => {
        ev.preventDefault();
        const pass = await ipcRenderer.invoke('pw', 'fill', u).catch(() => null);
        if (pass == null) return;
        const pw = field.type === 'password' ? field : pwFields()[0], uf = pw ? userField(pw) : field;
        if (uf && u) setVal(uf, u);
        if (pw) { setVal(pw, pass); sent = pass; }
        hide();
      };
      sh.lastElementChild.append(b);
    }
    Object.assign(box.style, { position: 'fixed', left: Math.round(r.left) + 'px', top: Math.round(r.bottom + 4) + 'px', zIndex: 2147483647 });
    document.documentElement.append(box);
  };
  const isLogin = f => f instanceof HTMLInputElement && (f.type === 'password' || (pwFields().length > 0 && userField(pwFields()[0]) === f));
  addEventListener('focusin', e => { if (isLogin(e.target)) show(e.target); else hide(); }, true);
  addEventListener('mouseup', e => { if (!box && isLogin(e.target) && !e.target.value) show(e.target); }, true);   // champ déjà sélectionné : un clic rouvre la suggestion
  addEventListener('mousedown', e => { if (box && !e.composedPath().includes(box)) hide(); }, true);
  addEventListener('scroll', hide, true);
}
