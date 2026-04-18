'use strict';
// 🜂 afterPack — z = xy (locale prune)
// x = electron locales dir  y = keep set  z = freed space
// Strips all Chromium locale files except en-US, saving ~20-30 MB.

const fs = require('fs');
const path = require('path');

const KEEP = new Set(['en-US.pak', 'en-US.pak.info']);

exports.default = async function afterPack({ appOutDir }) {
  const localesDir = path.join(appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;

  let removed = 0;
  let freedBytes = 0;

  for (const f of fs.readdirSync(localesDir)) {
    if (!KEEP.has(f)) {
      const fp = path.join(localesDir, f);
      const size = fs.statSync(fp).size;
      fs.unlinkSync(fp);
      removed++;
      freedBytes += size;
    }
  }

  const freed = (freedBytes / 1024 / 1024).toFixed(1);
  console.log(`  🜂 locale prune: removed ${removed} files, freed ${freed} MB`);
};
