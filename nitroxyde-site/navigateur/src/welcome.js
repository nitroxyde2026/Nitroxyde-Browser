const MODES = [
  ['normal', '🌐', 'Basique', 'Tout est actif : actualités, synchronisation, animations, téléchargements. Le navigateur travaille à pleine vitesse.'],
  ['gaming', '🎮', 'Gaming', 'Badge CPU/RAM dans la barre, téléchargements en pause, onglets en veille après 1 min, navigateur en priorité basse, animations de l’interface coupées, notifications discrètes. Raccourcis Steam, Discord, Twitch et YouTube.'],
];
nxt(skin);
nxp('look').then(skin);
MODES.forEach(([id, icon, name, text], i) => {
  const b = document.createElement('button');
  b.className = 'mode'; b.style.animationDelay = i * 60 + 'ms';
  b.innerHTML = '<i></i><b></b><span></span>';
  b.children[0].textContent = icon; b.children[1].textContent = name; b.children[2].textContent = text;
  b.onclick = async () => { await nxp('mode', id); nxp('go', 'nitroxyde://newtab'); };
  document.getElementById('modes').append(b);
});
