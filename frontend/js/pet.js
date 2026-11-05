/* ===== Layered-hill scene + the pet "Pip" (original character, animated with CSS) ===== */
function hillPts(w, h, base, amp, phase, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push([i * w / n, h * base + h * amp * Math.sin(phase + i * 1.15) + h * amp * .45 * Math.sin(phase * 2 + i * 2.1)]);
  return pts;
}
function ptsToPath(pts, w, h) {
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`; }
  return d + ` L${w} ${h} L0 ${h} Z`;
}
function yAt(pts, x) { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t = (x - x0) / (x1 - x0); const s = t * t * (3 - 2 * t); return y0 + (y1 - y0) * s; } return pts[pts.length - 1][1]; }
function pine(x, y, s, cls) { return `<path class="${cls}" d="M${x} ${y - 30 * s} L${x - 9 * s} ${y} L${x + 9 * s} ${y} Z"/>`; }

/* opts: w,h viewBox; pet: mood string or null; sunX/sunY fractions; seed shifts the hill shapes */
function sceneSVG({ w = 390, h = 260, mood = null, seed = 1, trees = true, label = '', petScale = .7 } = {}) {
  const L = [
    { base: .50, amp: .05, ph: seed * 1.3, cls: 'hill-far' },
    { base: .64, amp: .05, ph: seed * 2.1 + 1, cls: 'hill-mid' },
    { base: .79, amp: .035, ph: seed * 0.7 + 2, cls: 'hill-near' },
    { base: .92, amp: .02, ph: seed * 1.9 + 3, cls: 'hill-front' },
  ].map(l => ({ ...l, pts: hillPts(w, h, l.base, l.amp, l.ph, 6) }));
  const stars = [[.08, .1], [.22, .2], [.4, .08], [.58, .16], [.9, .09], [.68, .06], [.15, .32]].map(([x, y]) => `<circle class="star" cx="${x * w}" cy="${y * h}" r="${Math.max(1.4, w / 260)}"/>`).join('');
  const paths = L.map(l => `<path class="${l.cls}" d="${ptsToPath(l.pts, w, h)}"/>`);
  const t = trees ? pine(w * .08, yAt(L[1].pts, w * .08) + 6, h / 200, 'hill-front') + pine(w * .14, yAt(L[1].pts, w * .14) + 6, h / 260, 'hill-front') + pine(w * .88, yAt(L[2].pts, w * .88) + 8, h / 190, 'hill-front') + pine(w * .94, yAt(L[2].pts, w * .94) + 8, h / 250, 'hill-front') : '';
  const petY = yAt(L[3].pts, w * .5);
  const pet = mood ? `<g transform="translate(${(w / 2 - 100 * petScale).toFixed(1)} ${(petY - 186 * petScale).toFixed(1)}) scale(${petScale})">${petSVGInner(mood)}</g>` : '';
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice" role="img" aria-label="${esc(label || 'Calm hills at dusk')}">
    ${stars}<circle class="sun" cx="${w * .78}" cy="${h * .22}" r="${h * .085}"/>
    ${paths[0]}${paths[1]}${paths[2]}${t}${paths[3]}${pet}</svg>`;
}

const MOODS = { happy: 'Happy', content: 'Content', tired: 'Tired', down: 'Down' };
/* mood comes from today's rating and sleep: good day = happy, poor sleep = tired, low rating = down */
function petMood(score, dom) {
  if (score == null) return 'content';
  if (score < 38) return 'down';
  if (dom && dom.sleep != null && dom.sleep < 44) return 'tired';
  if (score >= 72) return 'happy';
  if (score >= 50) return 'content';
  return 'tired';
}
const PET_LINES = {
  happy: ['Pip is bouncing. Today is going well.', 'Pip feels proud of you.'],
  content: ['Pip is calm and keeping you company.', 'Pip is relaxed. A small step would make their day.'],
  tired: ['Pip is sleepy. A wind-down tonight would help.', 'Pip needs some rest too.'],
  down: ['Pip is having a quiet day. You do not have to fix it all today.', 'Pip would love a small, easy win.'],
};

function petSVGInner(mood) {
  return `<g class="pet" data-mood="${mood}">
    <g class="pet-all">
      <ellipse class="shadow" cx="100" cy="186" rx="58" ry="7"/>
      <g class="bodyg">
        <g class="tail"><path d="M142 156 C184 160 198 120 176 96 C172 122 158 136 138 136 Z" class="pb"/><path d="M176 96 C186 110 186 126 180 138 C170 128 170 112 176 96 Z" class="pbelly"/></g>
        <ellipse cx="100" cy="142" rx="54" ry="42" class="pb"/>
        <ellipse cx="100" cy="152" rx="32" ry="28" class="pbelly"/>
        <ellipse cx="74" cy="180" rx="17" ry="9" class="pb pdark"/><ellipse cx="126" cy="180" rx="17" ry="9" class="pb pdark"/>
        <g class="head">
          <g class="ear-l"><path d="M54 68 L44 20 Q74 26 90 54 Z" class="pb"/><path d="M58 58 L53 32 Q70 36 81 52 Z" class="pcheek"/></g>
          <g class="ear-r"><path d="M146 68 L156 20 Q126 26 110 54 Z" class="pb"/><path d="M142 58 L147 32 Q130 36 119 52 Z" class="pcheek"/></g>
          <ellipse cx="100" cy="94" rx="54" ry="44" class="pb"/>
          <ellipse cx="100" cy="110" rx="24" ry="16" class="pbelly"/>
          <g class="cheeks"><ellipse cx="66" cy="106" rx="9" ry="6" class="pcheek"/><ellipse cx="134" cy="106" rx="9" ry="6" class="pcheek"/></g>
          <g class="f f-open"><g class="eyes"><ellipse cx="78" cy="92" rx="6.5" ry="8.5" class="pink"/><ellipse cx="122" cy="92" rx="6.5" ry="8.5" class="pink"/><circle cx="80" cy="89" r="2.2" class="pwhite"/><circle cx="124" cy="89" r="2.2" class="pwhite"/></g></g>
          <g class="f f-happy"><path d="M69 95 Q78 82 87 95" class="pstroke"/><path d="M113 95 Q122 82 131 95" class="pstroke"/></g>
          <g class="f f-tired"><path d="M69 93 Q78 100 87 93" class="pstroke"/><path d="M113 93 Q122 100 131 93" class="pstroke"/></g>
          <g class="f f-down"><ellipse cx="78" cy="95" rx="6" ry="7.5" class="pink"/><ellipse cx="122" cy="95" rx="6" ry="7.5" class="pink"/><circle cx="80" cy="92" r="2" class="pwhite"/><circle cx="124" cy="92" r="2" class="pwhite"/><path d="M66 80 L90 85" class="pstroke thin"/><path d="M134 80 L110 85" class="pstroke thin"/></g>
          <path d="M95 103 Q100 99 105 103 Q100 108 95 103 Z" class="pink"/>
          <path class="m m-happy pstroke thin" d="M90 111 Q100 122 110 111"/>
          <path class="m m-content pstroke thin" d="M92 112 Q100 117 108 112"/>
          <ellipse class="m m-tired pink" cx="100" cy="114" rx="4.5" ry="5"/>
          <path class="m m-down pstroke thin" d="M92 118 Q100 110 108 118"/>
        </g>
      </g>
      <g class="fx fx-happy"><g transform="translate(36 44)"><path class="heart h1" d="M0 -3 C-4 -8 -11 -3 0 6 C11 -3 4 -8 0 -3Z"/></g><g transform="translate(164 38)"><path class="heart h2" d="M0 -3 C-4 -8 -11 -3 0 6 C11 -3 4 -8 0 -3Z"/></g><g transform="translate(100 8)"><path class="heart h3" d="M0 -3 C-4 -8 -11 -3 0 6 C11 -3 4 -8 0 -3Z"/></g></g>
      <g class="fx fx-tired"><text class="z z1" x="150" y="44" font-size="16">z</text><text class="z z2" x="162" y="26" font-size="20">z</text><text class="z z3" x="176" y="6" font-size="25">Z</text></g>
      <g class="fx fx-down"><path class="drop" d="M62 112 Q58 122 62 126 Q66 122 62 112Z"/></g>
    </g></g>`;
}
function petSVG(mood) { return `<svg class="pet-svg" viewBox="0 -8 200 204" role="img" aria-label="Pip, your pet, feeling ${MOODS[mood].toLowerCase()}">${petSVGInner(mood)}</svg>`; }
