const fs = require('fs');
const src = fs.readFileSync('c:/projects/manifold/brickbreaker3d/game.js','utf8');
const lines = src.split('\n');

// Top-level let/const/var declarations (state)
const stateLines = [];
// Function declarations
const fnLines = [];
// Physics/math expressions
const physicsLines = [];

lines.forEach((l,i) => {
  const t = l.trim();
  if (/^(let|var|const)\s+\w/.test(t)) stateLines.push([i+1, t.substring(0,80)]);
  if (/^function\s+\w/.test(t)) fnLines.push([i+1, t.substring(0,80)]);
});

console.log('=== TOP-LEVEL STATE (' + stateLines.length + ') ===');
stateLines.forEach(([n,l]) => console.log('L'+n+': '+l));

console.log('\n=== FUNCTIONS (' + fnLines.length + ') ===');
fnLines.forEach(([n,l]) => console.log('L'+n+': '+l));
