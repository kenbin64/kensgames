'use strict';
const fs = require('fs');
const file = 'c:/projects/manifold/assemble/index.html';
let content = fs.readFileSync(file, 'utf8');

// Find the broken addPartToPalette block (PowerShell stripped backticks)
const marker = 'btn.innerHTML = <div class="icon">';
const idx = content.indexOf(marker);
if (idx < 0) {
  console.log('Broken block not found - may already be fixed');
  process.exit(0);
}

const blockStart = content.lastIndexOf('    function addPartToPalette(p) {', idx);
// Find closing brace of this function
let depth = 0, pos = blockStart;
while (pos < content.length) {
  if (content[pos] === '{') depth++;
  else if (content[pos] === '}') { depth--; if (depth === 0) { pos++; break; } }
  pos++;
}

const newFunc = `    function addPartToPalette(p) {
      const grid = ensureCategory(p.category || 'Imported');
      const btn = document.createElement('button');
      btn.className = 'part-btn';
      btn.dataset.partId = p.id;
      btn.draggable = true;
      btn.innerHTML = \`<div class="icon">\${p.icon || '\u2b06'}</div><div class="lbl">\${p.label || p.id}</div>\`;
      btn.addEventListener('click', () => selectTool(p.id));
      btn.addEventListener('mouseenter', e => showTooltip(e, p.label || p.id, \`\${p.category || 'Imported'} \u2022 \${p.mass || 1}kg\`));
      btn.addEventListener('mouseleave', hideTooltip);
      btn.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'copy';
        hideTooltip();
      });
      grid.appendChild(btn);
    }`;

content = content.slice(0, blockStart) + newFunc + content.slice(pos);
fs.writeFileSync(file, content, 'utf8');
console.log('addPartToPalette fixed successfully.');
