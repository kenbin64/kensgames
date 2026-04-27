// Quick: where is ManifoldAudio referenced anywhere?
const fs = require('fs'), path = require('path');
function walk(d, out){
  for (const e of fs.readdirSync(d, { withFileTypes:true })) {
    const p = path.join(d, e.name);
    if (/node_modules|_archive|\.git/.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
}
const files = [];
walk('.', files);
const hits = {};
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split('\n');
  lines.forEach((l, i) => {
    if (/ManifoldAudio/.test(l)) {
      (hits[f] = hits[f] || []).push((i+1)+': '+l.trim().slice(0, 110));
    }
  });
}
for (const [f, arr] of Object.entries(hits)) {
  console.log(`\n${f}  (${arr.length} hits)`);
  arr.slice(0, 30).forEach(l => console.log('  '+l));
  if (arr.length > 30) console.log(`  …+${arr.length-30}`);
}
