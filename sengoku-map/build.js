/* src/ の各ファイルを一枚の HTML にまとめる。Artifact は単一ファイルで配信するため。 */
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const strip = s => s.replace(/\nif \(typeof module !== 'undefined'\).*\n?/g, '\n');

const page = read('page.html')
  .replace('/*__CSS__*/', () => '\n' + read('style.css'))
  .replace('/*__DATA__*/', () => '\n' + strip(read('data-geo.js')) + '\n' + strip(read('data-history.js')))
  .replace('/*__APP__*/', () => '\n' + read('app.js'));

const out = path.join(__dirname, 'sengoku-map.html');
fs.writeFileSync(out, page);
console.log(`${out}  ${(Buffer.byteLength(page) / 1024).toFixed(1)} KB`);
