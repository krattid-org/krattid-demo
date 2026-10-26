// Fails if dist JS/CSS contains syntax that esbuild would still lower for Safari 15, or APIs newer than Safari 15.
const esbuild = require('esbuild');
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../dist/assets');
let bad = 0;
const say = (m) => { bad++; console.log('FAIL ' + m); };
for (const f of fs.readdirSync(dir)) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const loader = f.endsWith('.css') ? 'css' : 'js';
  const a = esbuild.transformSync(src, { loader, minify: true, target: 'safari15' }).code;
  const b = esbuild.transformSync(src, { loader, minify: true }).code;
  if (a !== b) say(f + ': syntax needs lowering for safari15');
  const apis = /\(\?<[=!]|\.at\(|structuredClone|Object\.hasOwn|\.findLast|\.replaceAll\(|:has\(|\d(dvh|svh|lvh)\b|color-mix|@layer|@container|:focus-visible|accent-color|scroll-behavior|static\s*\{/;
  const m = src.match(apis);
  if (m) say(f + ': newer API/feature ' + m[0]);
}
console.log(bad ? 'SAFARI15 CHECK FAILED' : 'SAFARI15 CHECK OK');
process.exit(bad ? 1 : 0);
