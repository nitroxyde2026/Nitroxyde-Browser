const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const btn = (text, fn) => h('button', { textContent: text, onclick: fn });
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const day = t => new Date(t).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const PERM = { geolocation: 'Position', notifications: 'Notifications', media: 'Caméra / micro', midi: 'MIDI', 'clipboard-read': 'Presse-papiers', 'display-capture': 'Capture d’écran' };
let timer, icons = {};
nxt(skin);
nxp('look').then(skin);

// Logo du site, ou son initiale tant qu'il est inconnu
function ico(url) {
  const hs = host(url), box = h('span', { className: 'ico' });
  box.dataset.l = (hs[0] || '?').toUpperCase();
  if (icons[hs]) { const i = h('img', { src: icons[hs], alt: '' }); i.onerror = () => i.remove(); box.append(i); }
  return box;
}
const row = (icon, main, sub, ...acts) => h('div', { className: 'row' }, icon, h('div', { className: 'm' }, main, h('small', { textContent: sub })), ...acts);

const views = {
  async history() {
    const q = h('input', { placeholder: "Rechercher dans l'historique", size: 36 }), list = h('div');
    const draw = async () => {
      const out = []; let last = '';
      for (const x of await nxp('history', q.value)) {
        const d = day(x.t);
        if (d !== last) { out.push(h('h3', { textContent: d === day(Date.now()) ? "Aujourd'hui" : d })); last = d; }
        out.push(row(ico(x.url), h('a', { href: x.url, textContent: x.title || x.url }),
          `${new Date(x.t).toLocaleTimeString('fr-FR', { timeStyle: 'short' })} — ${host(x.url)}`,
          btn('✕', async () => { await nxp('delHistory', x.t); draw(); })));
      }
      list.replaceChildren(...out);
    };
    q.oninput = draw; draw();
    return [h('h2', { textContent: 'Historique' }),
      h('div', { className: 'row' }, q, btn('Tout effacer', async () => { await nxp('clearHistory'); draw(); })), list];
  },

  async bookmarks() {
    const list = h('div');
    const draw = async () => {
      const b = await nxp('bookmarks');
      list.replaceChildren(...(b.length
        ? b.map(x => row(ico(x.url), h('a', { href: x.url, textContent: x.title || x.url }), host(x.url),
            h('input', { value: x.folder || '', placeholder: 'dossier', size: 10, title: 'Dossier', onchange: e => nxp('bmFolder', { url: x.url, folder: e.target.value }) }),
            btn('✕', async () => { await nxp('delBookmark', x.url); draw(); })))
        : [h('p', { textContent: 'Aucun favori. Ctrl+D ajoute la page ouverte.' })]));
    };
    draw();
    return [h('h2', { textContent: 'Favoris' }), h('small', { className: 'note', textContent: 'Range un favori dans un dossier en tapant son nom. Le widget Favoris du nouvel onglet peut les afficher en grille ou en dossiers.' }), list];
  },

  async downloads() {
    const q = h('input', { placeholder: 'Rechercher un téléchargement', size: 36 }), list = h('div');
    const draw = async () => {
      const f = q.value.toLowerCase(), all = (await nxp('downloads')).slice().reverse().filter(d => d.name.toLowerCase().includes(f));
      list.replaceChildren(...(all.length ? all.map(d => {
        const pct = d.total > 0 ? d.got / d.total : 0;
        const label = { progress: Math.round(pct * 100) + ' %', paused: 'En pause', completed: 'Terminé', cancelled: 'Annulé', interrupted: 'Interrompu' }[d.state];
        const sc = d.scan === 'clean' ? ' · analysé : sain' : d.scan === 'threat' ? ' · ⚠ menace détectée' : d.risk === 'danger' ? ' · ⚠ fichier dangereux' : d.risk === 'warn' ? ' · ⚠ type de fichier à risque' : '';
        const acts = d.state === 'progress' ? [btn('Pause', () => nxp('dlPause', d.id)), btn('Annuler', () => nxp('dlCancel', d.id))]
          : d.state === 'paused' ? [btn('Reprendre', () => nxp('dlResume', d.id)), btn('Annuler', () => nxp('dlCancel', d.id))]
          : d.state === 'completed' ? [btn('Ouvrir', () => nxp('dlOpen', d.id)), btn('Dossier', () => nxp('dlShow', d.id))] : [];
        return h('div', { className: 'row' },
          h('div', { className: 'm' }, h('span', { textContent: d.name }), h('small', { textContent: label + sc, title: d.sha256 ? 'SHA-256 : ' + d.sha256 : '' }),
            h('div', { className: 'bar' }, h('i', { style: `transform:scaleX(${d.state === 'completed' ? 1 : pct})` }))), ...acts);
      }) : [h('p', { textContent: 'Aucun téléchargement.' })]));
    };
    timer = setInterval(draw, 1000); draw();
    return [h('h2', { textContent: 'Téléchargements' }), h('div', { className: 'row' }, q), list];
  },

  async passwords() {
    const q = h('input', { placeholder: 'Rechercher un site ou un identifiant', size: 34 }), list = h('div'), info = h('small', { className: 'note' });
    const draw = async () => {
      const f = q.value.toLowerCase(), all = (await nxp('pwList')).filter(x => (x.host + ' ' + x.user).toLowerCase().includes(f));
      list.replaceChildren(...(all.length ? all.map(x => {
        const val = h('code', { textContent: '••••••••' });
        let shown = false;
        return row(ico(x.origin), h('span', {}, h('b', { textContent: x.host }), '  ', h('span', { textContent: x.user || '(sans identifiant)' })),
          `${x.used ? 'Utilisé le ' + new Date(x.used).toLocaleDateString('fr-FR') : 'Enregistré le ' + new Date(x.at).toLocaleDateString('fr-FR')}`,
          val,
          btn('👁', async () => { shown = !shown; val.textContent = shown ? await nxp('pwReveal', x.i) : '••••••••'; }),
          btn('Copier', async e => { await nxp('pwCopy', x.i); e.target.textContent = 'Copié'; setTimeout(() => { e.target.textContent = 'Copier'; }, 1500); }),
          btn('✕', async () => { if (confirm(`Supprimer le mot de passe de ${x.host} ?`)) { await nxp('pwDel', x.i); draw(); } }));
      }) : [h('p', { textContent: f ? 'Aucun résultat.' : 'Aucun mot de passe enregistré. Connecte-toi sur un site : Nitroxyde proposera de le retenir.' })]));
      const nv = await nxp('pwNeverList');
      neverBox.replaceChildren(...(nv.length ? [h('h3', { textContent: 'Jamais enregistrés pour' }), ...nv.map(o => row(ico(o), h('span', { textContent: o.replace(/^https?:\/\//, '') }), '', btn('Retirer', async () => { await nxp('pwNeverDel', o); draw(); })))] : []));
    };
    const neverBox = h('div');
    q.oninput = draw; draw();
    return [h('h2', { textContent: 'Mots de passe' }),
      h('small', { className: 'note', textContent: 'Chiffrés par Windows sur ce PC et liés au site exact où ils ont été saisis. Un site ne peut jamais lire ceux d’un autre ; le remplissage se fait d’un clic sur la suggestion 🔑 sous le champ.' }),
      h('div', { className: 'row' }, q,
        btn('Importer (CSV)', async () => { const r = await nxp('pwImport'); info.textContent = r?.err || (r?.n ? `${r.n} mot(s) de passe importé(s).` : ''); draw(); }),
        btn('Exporter', () => nxp('pwExport'))),
      info,
      h('small', { className: 'note', textContent: 'Import depuis Chrome, Edge, Brave ou Opera : Paramètres › Mots de passe › Exporter (fichier CSV). Firefox : about:logins › ⋯ › Exporter.' }),
      list, neverBox];
  },

  async tasks() {
    const list = h('div'), head = h('div', { className: 'row' });
    const fmt = n => n >= 1024 ? (n / 1024).toFixed(2).replace('.', ',') + ' Go' : n + ' Mo';
    const draw = async () => {
      const d = await nxp('procs');
      head.replaceChildren(h('span', { className: 'm', textContent: `Total : ${fmt(d.total)} · CPU ${String(d.cpu).replace('.', ',')} %` }));
      const tabs = d.rows.filter(r => r.kind === 'tab').sort((a, b) => b.mem - a.mem), sys = d.rows.filter(r => r.kind === 'sys').sort((a, b) => b.mem - a.mem);
      const line = r => h('div', { className: 'row trow' + (r.active ? ' on' : '') },
        r.kind === 'tab' ? ico(r.url) : h('span', { className: 'ico', textContent: '⚙' }),
        h('div', { className: 'm' }, h('span', { textContent: (r.audio ? '🔊 ' : '') + r.name }), h('small', { textContent: r.sleeping ? 'En veille (0 Mo)' : r.shared ? 'Processus partagé avec un autre onglet' : r.pid ? 'Processus ' + r.pid : '' })),
        h('span', { className: 'num', textContent: r.sleeping ? '—' : fmt(r.mem) }),
        h('span', { className: 'num', textContent: r.sleeping ? '—' : String(r.cpu).replace('.', ',') + ' %' }),
        r.kind === 'tab' ? btn('Aller', () => nxp('procGo', r.id)) : h('span'),
        r.kind === 'tab' && !r.sleeping ? btn('Libérer', async () => { await nxp('procKill', r.id); draw(); }) : h('span'));
      list.replaceChildren(h('h3', { textContent: `Onglets (${tabs.length})` }), ...tabs.map(line), h('h3', { textContent: 'Navigateur' }), ...sys.map(line));
    };
    timer = setInterval(draw, 2000); draw();
    return [h('h2', { textContent: 'Gestionnaire des tâches' }),
      h('small', { className: 'note', textContent: 'Mémoire privée et processeur de chaque onglet, mesurés comme le Gestionnaire des tâches de Windows. « Libérer » vide l’onglet de la mémoire : il reste dans la barre et se recharge au clic.' }),
      head, list];
  },

  async settings() {
    const [s, about, perms, blk, keys, exts, prof, mus] = await Promise.all(['settings', 'about', 'perms', 'blockInfo', 'keyList', 'extList', 'profiles', 'musicState'].map(c => nxp(c)));
    const set = (k, v) => nxp('set', { k, v });
    const lab = (t, ...c) => h('div', { className: 'row' }, h('span', { className: 'm', textContent: t }), ...c);
    const pick = (k, label, opts, conv = x => x) => lab(label, h('select', { onchange: e => set(k, conv(e.target.value)) },
      ...opts.map(([v, t]) => h('option', { value: v, textContent: t, selected: v === s[k] }))));
    const chk = (k, label) => h('label', { className: 'row' }, h('input', { type: 'checkbox', checked: s[k], onchange: e => set(k, e.target.checked) }), label);
    const sec = (title, ...rows) => h('section', {}, h('h3', { textContent: title }), ...rows);
    const note = t => h('small', { className: 'note', textContent: t });
    const dir = (k, label, none) => lab(`${label} : ${s[k] || none}`, btn('Changer', async () => { await nxp('pickDir', k); route(); }));
    const status = h('small', { className: 'note' });
    let cssTimer;
    const themes = [['auto', 'Automatique (selon ton appareil)'], ['dark', 'Sombre'], ['light', 'Clair'], ['arcade', 'Arcade 8-bit'], ['galaxy', 'Galaxie'], ['tron', 'TRON (thème spécial, redémarre)'], ...(s.theme === 'custom' ? [['custom', 'Personnalisé']] : [])];
    const cap = id => e => {   // capture d'un raccourci : Ctrl/Alt + touche, ou touche F
      e.preventDefault();
      if (e.key === 'Escape') return e.target.blur();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const c = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+');
      if (!/^(Ctrl|Alt)/.test(c) && !/^F\d+$/.test(c)) return;
      e.target.value = c; nxp('keySet', { id, combo: c });
    };
    const pn = h('input', { placeholder: 'Nom du nouveau profil', size: 22 });
    return [h('h2', { textContent: 'Paramètres' }),
      sec("Mode d'utilisation", pick('mode', 'Mode', [['normal', 'Basique'], ['gaming', 'Gaming']]),
        note('Basique : tout est actif. Gaming : badge CPU/RAM dans la barre, téléchargements en pause, onglets en veille après 1 min, navigateur en priorité basse, animations de l’interface coupées, notifications discrètes, synchronisation en pause, actualités masquées. Un mode ne change ni ton thème ni ton fond (un fond animé reste animé).')),
      sec('Apparence', pick('theme', 'Thème', themes),
        pick('tabsPos', 'Position de la barre d’onglets', [['top', 'En haut'], ['bottom', 'En bas'], ['left', 'À gauche (verticale)'], ['right', 'À droite (verticale)']]),
        chk('sidebar', 'Barre latérale (Discord, WhatsApp, outils) — Ctrl+B'), chk('anim', 'Animations'),
        lab('Couleur d’accent', h('input', { type: 'color', value: s.accent || '#4d7cff', onchange: e => set('accent', e.target.value) }), btn('Réinitialiser', async () => { await set('accent', ''); route(); })),
        lab('Couleur unie (thème)', h('input', { type: 'color', value: '#4d7cff', onchange: e => nxp('solid', e.target.value) })),
        lab('Thème personnalisé', btn('Importer (.json)', () => nxp('importTheme')), btn('Exporter un modèle', () => nxp('exportTheme'))),
        note('Un thème est un fichier .json avec les couleurs bg, bg2, bg3, tx, dim, ac, gl et line (plus name, light et neon). Exporte un modèle, change les couleurs, puis réimporte-le : il rejoint « Mes thèmes » sur le nouvel onglet.'),
        h('div', { className: 'row' }, h('span', { className: 'm', textContent: 'CSS personnalisé (interface et pages internes)' })),
        h('textarea', { value: s.customCss, rows: 4, spellcheck: false, placeholder: '#bar { background: #123; }',
          oninput: e => { clearTimeout(cssTimer); cssTimer = setTimeout(() => set('customCss', e.target.value), 500); } })),
      sec('Nouvel onglet', chk('news', 'Afficher les actualités (avec images)'),
        pick('newsSource', 'Source des actualités', [['francetvinfo', 'France Info'], ['lemonde', 'Le Monde'], ['google', 'Google Actualités'], ['bbc', 'BBC News']]),
        chk('stats', 'Statistiques de protection'), chk('clock', 'Horloge'),
        pick('clockStyle', 'Style de l’horloge', [['digital', 'Numérique'], ['analog', 'Analogique'], ['minimal', 'Minimal'], ['neon', 'Néon'], ['retro', 'Rétro']]),
        chk('clock24', 'Format 24 h'), chk('clockSec', 'Afficher les secondes'),
        chk('notes', 'Notes rapides'), chk('tasks', 'Tâches'), chk('calendar', 'Calendrier'),
        chk('weather', 'Météo'), lab('Ville de la météo', h('input', { value: s.city, placeholder: 'Paris', onchange: e => set('city', e.target.value) })),
        chk('widgets', 'Widgets personnalisés'),
        pick('searchSize', 'Taille de la barre de recherche', [['s', 'Petite'], ['m', 'Moyenne'], ['l', 'Grande']]),
        pick('searchShape', 'Forme de la barre de recherche', [['pill', 'Arrondie'], ['round', 'Douce'], ['square', 'Droite']])),
      sec('Recherche', pick('engine', 'Moteur de recherche', [['duckduckgo', 'DuckDuckGo'], ['google', 'Google'], ['brave', 'Brave Search'], ['ecosia', 'Ecosia'], ['startpage', 'Startpage']])),
      sec('Assistant IA',
        pick('aiProvider', 'Fournisseur de l’aperçu et du panneau ✦', [['groq', 'Groq (Llama, gratuit)'], ['openai', 'ChatGPT (OpenAI)'], ['gemini', 'Gemini (Google)'], ['claude', 'Claude (Anthropic)']]),
        ...[['groq', 'Groq', 'gsk_…'], ['openai', 'ChatGPT (OpenAI)', 'sk-…'], ['gemini', 'Gemini', 'AIza…'], ['claude', 'Claude', 'sk-ant-…']].map(([id, name, ph]) =>
          lab(`Clé ${name}${s.hasKeys[id] ? ' (enregistrée)' : ''}`, h('input', { type: 'password', placeholder: s.hasKeys[id] ? '••••••••' : ph, id: 'k_' + id }),
            btn('Enregistrer', async e => { await nxp('aiKey', { provider: id, key: document.getElementById('k_' + id).value }); e.target.textContent = 'Enregistrée'; }))),
        chk('aiAuto', 'Aperçu IA au-dessus des résultats de recherche'),
        note('Une recherche tapée dans la barre d’adresse ou sur le nouvel onglet affiche la réponse du fournisseur choisi au-dessus des résultats, qui restent visibles en dessous. Il faut une clé API : Groq et Gemini en proposent une gratuite, ChatGPT et Claude fonctionnent avec des crédits payants. Un abonnement ChatGPT, Gemini ou Claude ne donne pas de clé : pour discuter avec ton compte, utilise le bouton ✦ de la barre latérale. Ta question (et le texte de la page si tu coches « Utiliser le contenu de la page ») part chez le fournisseur choisi.')),
      sec('Confidentialité',
        chk('adblock', 'Bloquer les publicités et les traceurs'),
        note(blk.engine ? 'Moteur avancé actif : EasyList, EasyPrivacy et listes uBlock, renouvelées chaque semaine. Le bouclier 🛡 permet de désactiver le bloqueur sur un site.' : 'Moteur avancé non chargé (premier lancement hors ligne, ou npm install à refaire) : seule la liste intégrée protège.'),
        chk('strip', 'Retirer les paramètres de suivi des liens (utm_, fbclid…)'),
        chk('https', "Passer automatiquement les sites en HTTPS quand c'est possible"),
        chk('gpc', 'Envoyer le signal « ne pas me suivre » (GPC et DNT)'),
        chk('cookies3', 'Bloquer les cookies tiers (peut casser certaines connexions)'),
        chk('cookieBanners', 'Masquer les bandeaux de cookies et les pop-ups gênants (au prochain démarrage)'),
        chk('pwOn', 'Proposer d’enregistrer et de remplir les mots de passe'),
        lab('Mots de passe enregistrés', btn('Gérer', () => { location.hash = 'passwords'; })),
        note('Les onglets privés (Ctrl+Maj+N) appliquent toujours le blocage des cookies tiers, le HTTPS et le signal GPC, et effacent tout à la fermeture.'),
        lab("Effacer l'historique, les cookies et le cache", btn('Effacer', async e => { await nxp('clearData'); e.target.textContent = 'Effacé'; })),
        h('div', { className: 'row' }, h('span', { className: 'm', textContent: 'Autorisations des sites' })),
        ...(perms.length ? perms.map(p => lab(`${p.site} — ${PERM[p.perm] || p.perm} : ${p.allow ? 'autorisé' : 'refusé'}`, btn('Retirer', async () => { await nxp('permDel', p.key); route(); })))
          : [note('Aucune autorisation mémorisée.')])),
      sec('Réseau', pick('dns', 'DNS privé (DNS sur HTTPS)', [['off', 'Désactivé (DNS du système)'], ['cloudflare', 'Cloudflare 1.1.1.1'], ['google', 'Google'], ['quad9', 'Quad9'], ['adguard', 'AdGuard (bloque aussi des pubs)'], ['custom', 'Personnalisé']]),
        lab('Adresse DNS personnalisée', h('input', { type: 'text', value: s.dnsCustom, placeholder: 'https://…/dns-query', size: 34, onchange: e => set('dnsCustom', e.target.value) })),
        note('Si plus aucun site ne se charge, remets « Désactivé » : le mode sécurisé n’a pas de repli.'),
        lab('VPN (NordVPN, Proton, Mullvad, Tor, proxy)', btn('Ouvrir le panneau VPN', () => nxp('vpnOpen'))),
        pick('netLimit', 'Limiteur réseau (débit maximal du navigateur)', [[0, 'Illimité'], [2, '2 Mbit/s'], [5, '5 Mbit/s'], [10, '10 Mbit/s'], [25, '25 Mbit/s'], [50, '50 Mbit/s'], [100, '100 Mbit/s']], Number),
        note('Le limiteur laisse la bande passante à tes jeux et appels (comme Opera GX). Il se règle aussi depuis le menu ☰.')),
      sec('Performance', pick('sleepMin', 'Mettre en veille les onglets inactifs après', [[0, 'Jamais'], [1, '1 min'], [2, '2 min'], [3, '3 min'], [5, '5 min'], [15, '15 min'], [30, '30 min']], Number),
        pick('ramBudgetMB', 'Budget mémoire du navigateur', [[0, 'Sans limite'], [800, '800 Mo'], [1200, '1,2 Go'], [1500, '1,5 Go'], [2000, '2 Go'], [3000, '3 Go']], Number),
        lab('Gestionnaire des tâches (Maj+Échap)', btn('Ouvrir', () => { location.hash = 'tasks'; })),
        note('Quand la mémoire totale dépasse le budget, les onglets inactifs les plus anciens sont mis en veille (ils se rechargent au clic). En mode Gaming, le budget ne dépasse pas 1 Go. Les panneaux de la barre latérale, de l’IA et de la recherche sont libérés quand on ne s’en sert plus.')),
      sec('Démarrage et téléchargements', chk('restore', 'Restaurer espaces, groupes et onglets au démarrage'),
        dir('downloadDir', 'Dossier de téléchargement', 'Téléchargements'), chk('dlSort', 'Ranger automatiquement par type (Images, Vidéos, Documents…)'),
        pick('dlLimitKB', 'Limite de débit des téléchargements', [[0, 'Aucune'], [256, '256 Ko/s'], [512, '512 Ko/s'], [1024, '1 Mo/s'], [2048, '2 Mo/s'], [5120, '5 Mo/s']], Number),
        note('Chaque fichier téléchargé est analysé : empreinte SHA-256, types de fichiers à risque et, sous Windows, analyse par Microsoft Defender.')),
      sec('Musique de fond', chk('musicStart', 'Lancer la musique au démarrage du navigateur'), chk('musicRepeat', 'Répéter la piste en boucle (décoché : les pistes s’enchaînent)'), chk('musicAuto', 'Mettre en pause quand un onglet joue du son'),
        ...(mus.special ? [note(`Thème ${mus.special} actif : sa musique « ${mus.name} » tourne en boucle. Choisis un autre thème pour retrouver tes pistes.`)] : []),
        lab(mus.on ? 'Lecture en cours : ' + mus.name : 'Musique en pause', btn(mus.on ? '⏸ Pause' : '▶ Lecture', async () => { await nxp('musicCtl', { op: 'toggle' }); route(); }),
          btn('⏭ Suivante', async () => { await nxp('musicCtl', { op: 'next' }); route(); })),
        lab('Volume', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: mus.vol, oninput: e => nxp('musicCtl', { op: 'vol', v: +e.target.value }) })),
        h('div', { className: 'row' }, h('span', { className: 'm', textContent: 'Pistes (clic pour jouer)' })),
        ...mus.tracks.map(t => h('div', { className: 'row trk' + (t.path === mus.track ? ' on' : '') },
          h('button', { className: 'm', textContent: (t.path === mus.track ? '♪ ' : '') + t.name + (t.def ? '  (par défaut)' : t.user ? '  (ajoutée)' : ''), onclick: async () => { await nxp('musicPlay', t.path); route(); } }),
          ...(t.user ? [btn('Supprimer', async () => { await nxp('musicDel', t.path); route(); })] : []))),
        lab('Ajouter tes musiques', btn('Choisir des fichiers…', async () => { await nxp('addMusic'); route(); })),
        note('Cinq musiques sont livrées avec le navigateur ; « Seismic Souls » de NUYA démarre au lancement. Par défaut, la piste choisie se répète en boucle. Le bouton ♪ de la barre met en pause d’un clic ; clic droit pour changer de piste.')),
      sec('Synchronisation', dir('syncDir', 'Dossier de synchronisation', 'aucun'),
        lab('Synchroniser favoris, raccourcis et réglages', btn('Synchroniser', async () => { status.textContent = '…'; const r = await nxp('syncNow'); status.textContent = r === 'ok' ? 'Synchronisé' : r; }), status),
        note("Choisis un dossier déjà synchronisé (OneDrive, Google Drive, Dropbox…) pour retrouver tes données sur un autre PC. Le fichier n'est pas chiffré et le plus récent écrase l'autre. L'historique, les mots de passe et la clé Groq ne sont pas synchronisés.")),
      sec('Raccourcis clavier', note('Clique sur un champ puis tape la combinaison (Ctrl ou Alt + touche, ou une touche F). Échap annule.'),
        ...keys.map(k => lab(k.label, h('input', { value: k.combo, readOnly: true, size: 16, onkeydown: cap(k.id), title: 'Par défaut : ' + k.def }))),
        lab('Tout remettre par défaut', btn('Réinitialiser', async () => { await nxp('keyReset'); route(); }))),
      sec('Extensions', ...(exts.length ? exts.map(x => lab(`${x.name} ${x.version}`, btn('Retirer', async () => { await nxp('extDel', x.id); route(); }))) : [note('Aucune extension chargée.')]),
        lab('Charger une extension (dossier décompressé)', btn('Choisir un dossier…', async () => { await nxp('extAdd'); route(); })),
        note('Le moteur Chromium d’Electron ne prend en charge qu’une partie de l’API des extensions Chrome (scripts de contenu, arrière-plan). Pas de boutons d’extension dans la barre ni d’installation depuis le Chrome Web Store.')),
      sec('Profils', ...prof.list.map(n => lab(n + (n === prof.current ? ' (actif)' : ''), n === prof.current ? h('span') : btn('Utiliser', () => nxp('profileUse', n)))),
        lab('Nouveau profil', pn, btn('Ajouter', async () => { await nxp('profileAdd', pn.value); route(); })),
        note('Chaque profil a ses propres cookies, historique, favoris et réglages. Changer de profil redémarre le navigateur.')),
      sec('Mises à jour et à propos', lab('Vérifier les mises à jour', btn('Vérifier', () => nxp('checkUpdate'))),
        note(`Nitroxyde Navigation ${about.version} — Chromium ${about.chrome}, Electron ${about.electron}`),
        lab('Réinitialiser tous les paramètres', btn('Réinitialiser', async () => { await nxp('reset'); route(); })),
        lab('Remise à zéro complète (comme une nouvelle installation)', btn('Tout effacer…', () => nxp('factoryReset'))),
        note('Efface réglages, historique, favoris, cookies, sessions, musiques et fonds ajoutés, puis redémarre sur l’écran de bienvenue. Pratique pour tester. Depuis le code source : npm run reset.'))];
  },
};

async function route() {
  clearInterval(timer);
  icons = await nxp('icons');
  const name = location.hash.slice(1) in views ? location.hash.slice(1) : 'history';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.hash === '#' + name));
  document.getElementById('m').replaceChildren(h('div', {}, ...(await views[name]())));
}
addEventListener('hashchange', route);
route();
