// Panneaux déroulants de la barre : menu ☰ et VPN
const $ = id => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null && k !== false)); return e; };
const box = $('box');
let I = {}, K = {};
nxt(skin);
// Icônes au trait, sans couleur (suivent la couleur du thème)
const svg = d => `<svg viewBox="0 0 24 24">${d}</svg>`;
const ICONS = {
  history: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  star: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  down: svg('<path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19.5h14"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 8.6-8.6m-3 3 2.5 2.5m-5-.5 2 2"/>'),
  full: svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  shield: svg('<path d="M12 2.8 4.5 5.6v5.6c0 4.6 3.1 8.6 7.5 10 4.4-1.4 7.5-5.4 7.5-10V5.6z"/>'),
};

const kbd = id => { const c = K[id]; return c ? h('kbd', { textContent: c.replace(/Shift/g, 'Maj').replace('Escape', 'Échap').replace('ArrowLeft', '←').replace('ArrowRight', '→') }) : null; };
const item = (icon, label, fn, id, extra) => h('button', { className: 'it', onclick: fn }, h('span', { className: 'l', textContent: label }), extra || kbd(id));
const act = (icon, label, id) => item(icon, label, () => nxm.call('act', id), id);
const call = (cmd, arg) => nxm.call(cmd, arg);
const fit = () => requestAnimationFrame(() => nxm.call('size', box.scrollHeight + 8));

nxm.onOpen((kind, info) => {
  document.body.dataset.kind = kind;
  if (kind === 'suggest') return suggestView(info);
  I = info; K = info.keys || {}; (kind === 'vpn' ? vpnView : menuView)(); fit();
});

// ---------------- Suggestions de la barre d'adresse ----------------
const ICO = {
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bookmark: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  url: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.7 5.4 3.7 8.5s-1.2 5.9-3.7 8.5c-2.5-2.6-3.7-5.4-3.7-8.5s1.2-5.9 3.7-8.5"/>',
};
function suggestView({ items, sel, q }) {
  const low = q.toLowerCase();
  box.replaceChildren(...items.map((it, i) => {
    const row = h('div', { className: 'sg' + (i === sel ? ' on' : '') });
    row.innerHTML = `<svg viewBox="0 0 24 24">${ICO[it.type] || ICO.search}</svg>`;
    const t = h('span', { className: 'st' });
    if (it.type === 'search' && it.text.toLowerCase().startsWith(low) && it.text.length > q.length) t.append(it.text.slice(0, q.length), h('b', { textContent: it.text.slice(q.length) }));   // la suite proposée en gras, comme Google
    else t.textContent = it.text;
    row.append(t);
    if (it.type !== 'search') row.append(h('small', { textContent: it.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60) }));
    if (it.type === 'history') row.append(h('i', { className: 'del', textContent: '✕', title: 'Retirer de l’historique', onmousedown: e => { e.stopPropagation(); e.preventDefault(); call('delHist', i); } }));
    row.onmousedown = e => { e.preventDefault(); call('pick', i); };
    return row;
  }));
  fit();
}

// ---------------- Menu ☰ ----------------
function menuView() {
  const web = I.web, zoomVal = h('span', { className: 'val', textContent: I.zoom + ' %' });
  const zoom = async d => { zoomVal.textContent = (await call('zoom', d)) + ' %'; };
  const lang = h('select', { title: 'Langue de traduction' }, ...I.langs.map(([v, n]) => h('option', { value: v, textContent: n, selected: v === I.lang })));
  const mode = h('div', { className: 'seg' }, ...[['normal', 'Basique'], ['gaming', 'Gaming']].map(([v, n]) =>
    h('button', { textContent: n, className: I.mode === v ? 'on' : '', onclick: async () => { I = { ...I, ...(await call('mode', v)) }; menuView(); } })));
  const net = h('select', { title: 'Débit maximal du navigateur', onchange: e => call('netLimit', +e.target.value) },
    ...[[0, 'Illimité'], [2, '2 Mbit/s'], [5, '5 Mbit/s'], [10, '10 Mbit/s'], [25, '25 Mbit/s'], [50, '50 Mbit/s'], [100, '100 Mbit/s']]
      .map(([v, n]) => h('option', { value: v, textContent: n, selected: v === I.netLimit })));
  const more = h('details', {},
    h('summary', { className: 'it' }, h('span', { className: 'l', textContent: 'Plus d’outils' }), h('span', { className: 'arr', textContent: '›' })),
    item('', 'Sessions enregistrées', () => call('native', 'sessions'), null, h('span', { className: 'arr', textContent: '›' })),
    item('', 'Profils', () => call('native', 'profiles'), null, h('span', { className: 'arr', textContent: '›' })),
    act('', 'Code source de la page', 'source'),
    act('', 'Outils de développement', 'devtools'),
    item('', 'Extensions', () => call('page', 'settings')),
    item('', 'Raccourcis clavier', () => call('page', 'settings')),
    act('', 'Mini lecteur vidéo', 'pip'));
  more.ontoggle = fit;

  box.replaceChildren(
    h('div', { className: 'head' }, h('img', { src: 'logo.png', alt: '' }), h('span', { className: 'v', textContent: 'v' + I.version + (I.profile ? ' · ' + I.profile : '') }), mode),
    act('', 'Nouvel onglet', 'newTab'),
    act('', 'Nouvel onglet privé', 'privateTab'),
    act('', 'Rouvrir l’onglet fermé', 'reopenTab'),
    h('hr'),
    h('div', { className: 'ctl' }, h('span', { className: 'l', textContent: 'Zoom' }),
      h('button', { className: 'sq', textContent: '−', title: 'Zoom arrière (Ctrl -)', onclick: () => zoom(-1) }), zoomVal,
      h('button', { className: 'sq', textContent: '+', title: 'Zoom avant (Ctrl +)', onclick: () => zoom(1) }),
      h('button', { textContent: '100 %', title: 'Taille normale (Ctrl 0)', onclick: () => zoom(0) }),
      (() => { const b = h('button', { className: 'sq', title: 'Plein écran (F11)', onclick: () => call('act', 'fullscreen') }); b.innerHTML = ICONS.full; return b; })()),
    I.translated
      ? h('div', { className: 'ctl' }, h('span', { className: 'l', textContent: 'Traduite' }), h('button', { textContent: 'Original', title: 'Afficher la page d’origine', onclick: () => call('original') }), lang,
          h('button', { className: 'sq', textContent: '↻', title: 'Traduire dans cette langue', onclick: () => call('translate', lang.value) }))
      : h('div', { className: 'ctl' + (web ? '' : ' dis'), title: web ? '' : 'Ouvre un site pour le traduire' }, h('span', { className: 'l', textContent: 'Traduire en' }), lang,
          h('button', { textContent: 'Traduire', disabled: !web, onclick: () => call('translate', lang.value) })),
    h('div', { className: 'ctl' }, h('span', { className: 'l', textContent: 'Rechercher avec' }),
      h('select', { title: 'Moteur de la barre d’adresse et du nouvel onglet', onchange: e => call('engine', e.target.value) },
        ...[['google', 'Google'], ['duckduckgo', 'DuckDuckGo'], ['bing', 'Bing'], ['brave', 'Brave Search'], ['ecosia', 'Ecosia'], ['qwant', 'Qwant'], ['startpage', 'Startpage']]
          .map(([v, n]) => h('option', { value: v, textContent: n, selected: v === I.engine })))),
    h('hr'),
    h('div', { className: 'grid' },
      ...[[ICONS.history, 'Historique', 'history'], [ICONS.star, 'Favoris', 'bookmarks'], [ICONS.down, 'Télécharg.', 'downloads'], [ICONS.key, 'Mots de passe', 'passwords']]
        .map(([i, n, p]) => { const b = h('button', { onclick: () => call('page', p), title: n }, n); b.insertAdjacentHTML('afterbegin', i); return b; })),
    h('hr'),
    act('', 'Rechercher dans la page', 'find'),
    act('', 'Imprimer…', 'print'),
    act('', 'Enregistrer la page…', 'savePage'),
    item('', 'Copier le lien de la page', () => call('copyLink')),
    act('', I.speaking ? 'Arrêter la lecture à voix haute' : 'Lire la page à voix haute', 'speak'),
    act('', 'Mode lecture', 'reader'),
    act('', 'Forcer le mode sombre sur la page', 'forceDark'),
    act('', 'Capture d’écran de la page', 'screenshot'),
    h('hr'),
    act('', 'Assistant IA', 'ai'),
    act('', I.side ? 'Masquer la barre latérale' : 'Afficher la barre latérale', 'sidebar'),
    act('', 'Gestionnaire des tâches', 'tasks'),
    h('div', { className: 'ctl' }, h('span', { className: 'l', textContent: 'Limiteur réseau' }), net),
    item('', 'Effacer les données de navigation…', () => call('clearData')),
    more,
    h('hr'),
    h('div', { className: 'foot' },
      item('', 'Paramètres', () => call('page', 'settings')),
      item('', 'Aide', () => call('act', 'help')),
      item('', 'Quitter', () => call('act', 'quit'))));
  box.querySelector('.it')?.focus();
}

// ---------------- VPN ----------------
let V = null, busy = false, msg = '';
async function vpnView(state) {
  V = state || V || I.vpn;
  const v = V, prov = v.providers.find(p => p.id === v.provider) || v.providers[0];
  const sw = h('div', { className: 'sw' + (v.on ? ' on' : '') + (busy ? ' busy' : ''), title: v.on ? 'Déconnecter' : 'Connecter',
    onclick: () => run(v.on ? 'disconnect' : 'connect') });
  const ip = v.ip;
  const ok = v.on && ip && (v.proxied || ip.mullvad);
  const card = h('div', { className: 'card ' + (v.on ? (ok || (v.on && !v.proxied && ip) ? 'ok' : 'bad') : '') },
    h('div', { className: 'st', textContent: busy ? 'Connexion…' : v.on ? (v.proxied ? 'Protégé' : `${prov.name} (appli)`) : 'Non protégé' }),
    v.on && v.label ? h('div', { className: 'ip', textContent: v.label }) : null,
    ip ? h('div', { className: 'ip', textContent: `IP visible des sites : ${ip.ip}${ip.city || ip.country ? ' · ' + [ip.city, ip.country].filter(Boolean).join(', ') : ''}${ip.org ? ' · ' + ip.org : ''}${ip.mullvad ? ' · ✓ sortie Mullvad' : ''}` }) : null,
    msg ? h('div', { className: 'err', textContent: msg }) : null,
    h('div', { className: 'ip' }, h('a', { textContent: 'Vérifier mon adresse IP', onclick: () => run('check') })));

  const chips = h('div', { className: 'chips' }, ...v.providers.map(p =>
    h('button', { className: p.id === v.provider ? 'on' : '', textContent: p.name, onclick: () => run('set', { provider: p.id }) })));

  const body = [];
  const save = (k, el) => { el.onchange = () => run('set', { [k]: el.type === 'number' ? +el.value : el.value }); return el; };
  if (v.provider === 'nord') {
    body.push(
      h('div', { className: 'f' }, h('label', { textContent: 'Pays du serveur' }),
        save('country', h('select', {}, ...v.countries.map(c => h('option', { value: c.id, textContent: (c.flag ? c.flag + '  ' : '') + c.name, selected: c.id === v.country }))))),
      h('div', { className: 'f' }, h('label', { textContent: 'Identifiant de service NordVPN' }), save('user', h('input', { value: v.user, placeholder: 'ex. AbCdEf12345', spellcheck: false }))),
      h('div', { className: 'f' }, h('label', { textContent: 'Mot de passe de service' }), save('pass', h('input', { type: 'password', placeholder: v.hasPass ? '•••••••• (enregistré)' : 'mot de passe de service' }))),
      h('div', { className: 'tip' }, 'Ce ne sont pas ton e-mail et ton mot de passe Nord : ce sont les « identifiants de service » de ton compte. ',
        h('a', { textContent: 'Les trouver', onclick: () => call('vpn', { cmd: 'site', arg: { id: 'nord' } }) })));
  } else if (v.provider === 'proton' || v.provider === 'mullvad') {
    const inst = v.installed[v.provider];
    body.push(
      h('div', { className: 'tip' }, `${prov.name} ne fournit pas de serveurs pour un navigateur seul : son appli protège tout le PC (navigateur compris). ` +
        (v.provider === 'proton' ? 'L’offre gratuite de Proton suffit.' : 'Mullvad ne demande ni e-mail ni nom.') + ' Connecte-toi dans l’appli, puis active ici : Nitroxyde vérifie que tes sites voient bien l’IP du VPN.'),
      h('button', { className: 'btn ghost', textContent: inst ? `Ouvrir ${prov.name}` : `Télécharger ${prov.name}`, onclick: () => call('vpn', { cmd: 'openApp', arg: { id: v.provider } }) }));
  } else if (v.provider === 'tor') {
    body.push(h('div', { className: 'tip' }, 'Le réseau Tor rend ta navigation très anonyme mais plus lente. Lance le Tor Browser (ou le service Tor) et laisse-le ouvert, puis active ici.'),
      h('button', { className: 'btn ghost', textContent: 'Télécharger Tor', onclick: () => call('vpn', { cmd: 'site', arg: { id: 'tor' } }) }));
  } else {
    body.push(
      h('div', { className: 'f' }, h('label', { textContent: 'Type' }), save('type', h('select', {}, ...[['socks5', 'SOCKS5'], ['https', 'HTTPS'], ['http', 'HTTP']].map(([x, n]) => h('option', { value: x, textContent: n, selected: x === v.type }))))),
      h('div', { className: 'row2' },
        h('div', { className: 'f' }, h('label', { textContent: 'Serveur' }), save('host', h('input', { value: v.host, placeholder: 'proxy.exemple.com', spellcheck: false }))),
        h('div', { className: 'f', style: 'flex:0 0 90px' }, h('label', { textContent: 'Port' }), save('port', h('input', { type: 'number', value: v.port || '', placeholder: '1080' })))),
      h('div', { className: 'row2' },
        h('div', { className: 'f' }, h('label', { textContent: 'Identifiant (facultatif)' }), save('user', h('input', { value: v.user, spellcheck: false }))),
        h('div', { className: 'f' }, h('label', { textContent: 'Mot de passe' }), save('pass', h('input', { type: 'password', placeholder: v.hasPass ? '••••••••' : '' })))),
      h('div', { className: 'tip', textContent: 'Fonctionne avec les proxys SOCKS5 de Surfshark, PIA, Windscribe, IPVanish ou ton propre serveur.' }));
  }

  box.replaceChildren(...[
    (() => { const d = h('div', { className: 'vh' }, h('b', { textContent: 'VPN' }), sw); d.insertAdjacentHTML('afterbegin', ICONS.shield); return d; })(),
    card, chips, ...body,
    v.provider !== 'proton' && v.provider !== 'mullvad'
      ? h('label', { className: 'chk' }, h('input', { type: 'checkbox', checked: v.kill, onchange: e => run('set', { kill: e.target.checked }) }), 'Coupe-circuit : bloquer la navigation si le VPN ne répond pas')
      : null,
    h('div', { className: 'tip', textContent: 'Concerne les onglets et le panneau latéral. Tes adresses DNS et WebRTC passent aussi par le VPN : pas de fuite de ta vraie IP.' })].filter(Boolean));
  fit();
}
async function run(cmd, arg) {
  if (busy) return;
  busy = cmd === 'connect' || cmd === 'check' || (cmd === 'set' && V.on);
  msg = '';
  if (busy) vpnView();
  const r = await call('vpn', { cmd, arg });
  busy = false;
  if (r && r.err) msg = r.err;
  vpnView(r && r.providers ? r : await call('vpn', { cmd: 'state' }));
}
