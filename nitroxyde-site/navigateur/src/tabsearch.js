const $ = id => document.getElementById(id);
let all = [], shown = [], sel = 0;
nxt(skin);

function render() {
  const t = $('q').value.toLowerCase().split(/\s+/).filter(Boolean);
  shown = all.filter(x => t.every(w => (x.title + ' ' + x.url).toLowerCase().includes(w)));
  sel = Math.min(sel, Math.max(0, shown.length - 1));
  $('list').replaceChildren(...(shown.length ? shown.map((x, i) => {
    const el = document.createElement('div');
    el.className = 'it' + (i === sel ? ' on' : '');
    el.innerHTML = '<span></span><b></b><small></small>';
    el.children[0].textContent = x.space; el.children[1].textContent = x.title || x.url; el.children[2].textContent = x.url.replace(/^https?:\/\/(www\.)?/, '');
    el.onclick = () => nxk.call('go', x.id);
    return el;
  }) : [Object.assign(document.createElement('div'), { className: 'none', textContent: 'Aucun onglet ne correspond.' })]));
  $('list').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}

nxk.onOpen(async () => { $('q').value = ''; sel = 0; all = await nxk.call('list'); render(); $('q').focus(); });
$('q').oninput = () => { sel = 0; render(); };
$('q').onkeydown = e => {
  if (e.key === 'Escape') nxk.call('close');
  else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
  else if (e.key === 'Enter' && shown[sel]) nxk.call('go', shown[sel].id);
};
