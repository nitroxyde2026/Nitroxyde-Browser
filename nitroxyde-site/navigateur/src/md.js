// Mise en forme minimale du Markdown, sans jamais injecter de HTML
function md(src) {
  const root = document.createDocumentFragment();
  let list = null, code = null;
  const inline = (el, s) => {
    for (const part of s.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
      if (!part) continue;
      let n;
      if (part.startsWith('**')) { n = document.createElement('b'); n.textContent = part.slice(2, -2); }
      else if (part.startsWith('`')) { n = document.createElement('code'); n.textContent = part.slice(1, -1); }
      else n = document.createTextNode(part);
      el.append(n);
    }
  };
  for (const line of src.split('\n')) {
    if (line.startsWith('```')) { if (code) { root.append(code); code = null; } else code = document.createElement('pre'); continue; }
    if (code) { code.textContent += line + '\n'; continue; }
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (li) {
      if (!list) { list = document.createElement('ul'); root.append(list); }
      const e = document.createElement('li'); inline(e, li[1]); list.append(e);
      continue;
    }
    list = null;
    if (!line.trim()) continue;
    const hd = line.match(/^#{1,6}\s+(.*)/), p = document.createElement(hd ? 'h4' : 'p');
    inline(p, hd ? hd[1] : line); root.append(p);
  }
  if (code) root.append(code);
  return root;
}
