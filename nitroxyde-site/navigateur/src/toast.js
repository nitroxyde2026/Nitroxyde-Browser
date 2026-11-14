const $ = id => document.getElementById(id);
nxt(skin);
nxo.onToast(d => {
  const t = $('t'), inp = $('tin');
  t.classList.remove('in', 'timed');
  $('ic').textContent = d.icon || 'ℹ';
  $('ti').textContent = d.title || '';
  $('tt').textContent = d.text || '';
  $('tt').hidden = !!d.input;
  inp.hidden = !d.input;
  if (d.input) { inp.placeholder = d.input.placeholder || ''; inp.value = d.input.value || ''; }
  $('ac').replaceChildren(...(d.actions || []).map(a => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.onclick = () => nxo.answer(d.id, a.value, inp.value);
    return b;
  }));
  inp.onkeydown = e => {
    if (e.key === 'Enter') nxo.answer(d.id, (d.actions[0] || {}).value, inp.value);
    else if (e.key === 'Escape') nxo.answer(d.id, false, '');
  };
  t.style.setProperty('--ms', (d.ms || 0) + 'ms');
  void t.offsetWidth;                            // relance les animations
  t.classList.add('in');
  if (d.ms) t.classList.add('timed');
  if (d.input) { inp.focus(); inp.select(); }
});
nxo.onHide(() => $('t').classList.remove('in'));
