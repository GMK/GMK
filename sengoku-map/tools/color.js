/* OKLab / CVD シミュレーション（Machado 2009, severity 1.0）。
   dataviz スキルの validate_palette.js と同じ計算を、この repo 内で使えるよう抜き出したもの。 */
const MACHADO = {
  protan: [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
  deutan: [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
  tritan: [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]
};
const s2lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lin2s = c => { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hex2lin = h => { h = h.replace('#',''); return [0,2,4].map(i => s2lin(parseInt(h.slice(i,i+2),16)/255)); };
function oklabFromLin([r,g,b]) {
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
          1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
          0.0259040371*l + 0.7827717662*m - 0.8086757660*s];
}
function simulate(linRGB, kind) {
  const M = MACHADO[kind], cl = c => Math.max(0, Math.min(1, c));
  return [0,1,2].map(i => cl(M[i][0]*linRGB[0] + M[i][1]*linRGB[1] + M[i][2]*linRGB[2]));
}
const dist = (a, b) => 100 * Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
/* 通常視・P型・D型・T型の 4 通りの OKLab 座標をまとめて返す */
function labs(hex) {
  const l = hex2lin(hex);
  return { normal: oklabFromLin(l), protan: oklabFromLin(simulate(l,'protan')),
           deutan: oklabFromLin(simulate(l,'deutan')), tritan: oklabFromLin(simulate(l,'tritan')) };
}
const relLum = hex => { const [r,g,b] = hex2lin(hex); return 0.2126*r + 0.7152*g + 0.0722*b; };
const contrast = (a,b) => { const [hi,lo] = [relLum(a), relLum(b)].sort((x,y)=>y-x); return (hi+0.05)/(lo+0.05); };
function oklch2hex(L, C, h) {
  const a = C*Math.cos(h*Math.PI/180), bb = C*Math.sin(h*Math.PI/180);
  const l_ = L + 0.3963377774*a + 0.2158037573*bb, m_ = L - 0.1055613458*a - 0.0638541728*bb, s_ = L - 0.0894841775*a - 1.2914855480*bb;
  const l = l_**3, m = m_**3, s = s_**3;
  const rgb = [ 4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
               -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
               -0.0041960863*l - 0.7034186147*m + 1.7076147010*s ];
  if (rgb.some(v => v < -0.0015 || v > 1.0015)) return null;
  return '#' + rgb.map(v => Math.round(Math.min(1,Math.max(0,lin2s(v)))*255).toString(16).padStart(2,'0')).join('');
}
const oklchOf = hex => { const [L,a,b] = oklabFromLin(hex2lin(hex));
  return [L, Math.hypot(a,b), ((Math.atan2(b,a)*180/Math.PI)%360+360)%360]; };
module.exports = { labs, dist, contrast, oklch2hex, oklchOf };
