(() => {
  // Étoiles du fond
  const sky = document.getElementById('sky');
  if (sky) for (let i = 0; i < 24; i++) {
    const s = document.createElement('i');
    s.className = 'sp';
    s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;--s:${6 + Math.random() * 14}px;--d:${3 + Math.random() * 5}s;--l:${-Math.random() * 6}s`;
    sky.append(s);
  }

  // Menu mobile
  const burger = document.querySelector('.burger'), nav = document.querySelector('nav.main');
  if (burger) burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); });

  // Plateforme du visiteur
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const os = /Windows/i.test(ua) ? 'win' : /Mac/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) ? 'linux' : 'win';
  const NAMES = { win: 'Windows', mac: 'macOS', linux: 'Linux' };
  document.querySelector(`.card[data-os="${os}"]`)?.classList.add('me');

  // Boutons « copier » des commandes
  const names = { win: 'Nitroxyde-Browser-Setup-0.10.3.exe', mac: 'Nitroxyde-Browser-0.10.3.dmg', linux: 'Nitroxyde-Browser-0.10.3.AppImage' };
  const fill = () => document.querySelectorAll('[data-tpl]').forEach(e => {
    e.textContent = e.dataset.tpl.replace(/\{(win|mac|linux)\}/g, (_, k) => names[k]);
  });
  document.querySelectorAll('pre.cmd').forEach(pre => {
    const b = document.createElement('button');
    b.className = 'copy'; b.type = 'button'; b.textContent = 'Copier';
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(pre.querySelector('code').textContent); b.textContent = 'Copié'; } catch { b.textContent = 'Sélectionne le texte'; }
      setTimeout(() => { b.textContent = 'Copier'; }, 1800);
    });
    pre.append(b);
  });

  // Version, liens et empreintes lus dans version.json
  function apply(j) {
    for (const k of ['win', 'mac', 'linux']) if (j.files?.[k]) names[k] = j.files[k].split('/').pop();
    fill();
    document.querySelectorAll('[data-version]').forEach(e => { e.textContent = j.version; });
    document.querySelectorAll('[data-file]').forEach(e => {
      const f = j.files?.[e.dataset.file];
      if (f) { e.href = f; e.setAttribute('download', ''); e.removeAttribute('aria-disabled'); e.classList.remove('off'); if (e.dataset.label) e.textContent = e.dataset.label; }
      else { e.removeAttribute('href'); e.setAttribute('aria-disabled', 'true'); e.classList.add('off'); e.textContent = 'Bientôt disponible'; }
    });
    document.querySelectorAll('[data-sha]').forEach(e => { e.textContent = j.sha256?.[e.dataset.sha] || 'Publiée avec chaque version.'; });
    document.querySelectorAll('[data-size]').forEach(e => { const b = j.size?.[e.dataset.size]; e.textContent = b ? ` · ${Math.round(b / 1048576)} Mo` : ''; });
    const dl = document.getElementById('dl'), meta = document.getElementById('meta');
    if (dl) {
      const target = j.files?.[os] ? os : j.files?.win ? 'win' : null;
      if (mobile) { dl.textContent = 'Voir le téléchargement'; dl.href = '/telecharger'; if (meta) meta.textContent = `Gratuit · version ${j.version} · pour ordinateur, l’application mobile viendra plus tard`; }
      else if (target) { dl.textContent = `Télécharger pour ${NAMES[target]}`; dl.href = '/telecharger'; if (meta) meta.textContent = `Gratuit · version ${j.version}${target !== os ? ` · ${NAMES[os]} bientôt disponible` : ''}`; }
    }
  }
  fill();
  fetch('version.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => { if (j) apply(j); }).catch(() => {});
})();
