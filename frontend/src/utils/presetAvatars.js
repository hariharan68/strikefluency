// 10 self-contained flat-illustration avatars (5 "men", 5 "women"), generated as
// inline SVG data URIs — no network, no assets, CSP-safe. Styled after modern
// circular "corporate flat" avatars: full-bleed background, two-tone face
// shading, detailed eyes (iris + pupil + highlight), brows, nose, ears and a
// V-neck sweater. The backend stores only the key (e.g. "men_3"); the picture
// lives here. Keys must stay in sync with backend AVATAR_PRESETS.

const darken = (hex, f) => {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 255) * (1 - f))
  const g = Math.round(((n >> 8) & 255) * (1 - f))
  const b = Math.round((n & 255) * (1 - f))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// Hair silhouettes (viewBox 0 0 200 200). Each returns { back, front }.
// `back` is drawn behind the head (long hair), `front` over the crown.
const HAIR = {
  spiky: (c) => ({
    back: '',
    front: `<path d="M60 74 C56 42 74 24 100 24 C126 24 144 42 140 74 C137 58 128 49 100 49 C72 49 63 58 60 74 Z" fill="${c}"/>
      <path d="M64 42 L70 12 L80 32 L88 10 L98 30 L100 6 L110 30 L120 12 L128 34 L136 44 C130 30 118 24 100 24 C82 24 70 30 64 42 Z" fill="${c}"/>
      <path d="M62 74 C60 58 68 50 82 48 L78 66 Z" fill="${darken(c, 0.18)}"/>`,
  }),
  short: (c) => ({
    back: '',
    front: `<path d="M60 74 C56 42 74 24 100 24 C126 24 144 42 140 74 C137 58 128 49 100 49 C72 49 63 58 60 74 Z" fill="${c}"/>
      <path d="M60 74 C58 56 66 48 80 46 L78 64 Z" fill="${darken(c, 0.18)}"/>`,
  }),
  buzz: (c) => ({
    back: '',
    front: `<path d="M63 68 C62 40 78 26 100 26 C122 26 138 40 137 68 C132 52 120 45 100 45 C80 45 68 52 63 68 Z" fill="${c}"/>`,
  }),
  curly: (c) => ({
    back: '',
    front: `<path d="M60 74 C50 60 56 30 78 26 C88 18 112 18 122 26 C144 30 150 60 140 74 C142 62 134 58 130 62 C132 50 120 48 118 56 C120 44 106 44 106 52 C104 40 94 42 94 52 C92 44 80 46 82 56 C78 48 68 52 70 62 C66 58 58 62 60 74 Z" fill="${c}"/>`,
  }),
  sidepart: (c) => ({
    back: '',
    front: `<path d="M60 74 C56 42 74 24 100 24 C126 24 144 42 140 74 C138 58 130 49 104 50 C86 52 74 56 66 66 C64 58 61 62 60 74 Z" fill="${c}"/>
      <path d="M104 50 C114 50 126 55 133 67 C131 56 122 51 106 51 Z" fill="${darken(c, 0.18)}"/>`,
  }),
  long: (c) => ({
    back: `<path d="M50 92 C42 52 66 26 100 26 C134 26 158 52 150 92 L152 150 L134 158 C142 104 130 58 100 58 C70 58 58 104 66 158 L48 150 Z" fill="${c}"/>`,
    front: `<path d="M58 78 C54 44 74 26 100 26 C126 26 146 44 142 78 C138 60 128 50 100 50 C72 50 62 60 58 78 Z" fill="${darken(c, 0.06)}"/>`,
  }),
  longwavy: (c) => ({
    back: `<path d="M50 92 C42 52 66 26 100 26 C134 26 158 52 150 92 C154 108 148 120 152 138 C146 132 148 148 150 158 C142 150 140 140 138 150 C140 110 130 58 100 58 C70 58 60 110 62 150 C60 140 58 150 50 158 C52 148 54 132 48 138 C52 120 46 108 50 92 Z" fill="${c}"/>`,
    front: `<path d="M58 78 C54 44 74 26 100 26 C126 26 146 44 142 78 C138 60 128 50 100 50 C72 50 62 60 58 78 Z" fill="${darken(c, 0.06)}"/>`,
  }),
  bun: (c) => ({
    back: `<circle cx="100" cy="20" r="15" fill="${c}"/>`,
    front: `<path d="M60 74 C56 40 74 24 100 24 C126 24 144 40 140 74 C137 56 128 48 100 48 C72 48 63 56 60 74 Z" fill="${c}"/>`,
  }),
  pixie: (c) => ({
    // Short, neat cut that hugs the head and comes down past the temples — no
    // shoulder hair, so it can't leave gaps and reads clearly different from the
    // longer women's styles.
    back: '',
    front: `<path d="M56 78 C52 40 74 22 100 22 C126 22 148 40 144 78 C146 88 141 98 132 100 C137 86 135 72 130 66 C135 56 124 49 100 49 C76 49 65 56 70 66 C65 72 63 86 68 100 C59 98 54 88 56 78 Z" fill="${c}"/>
      <path d="M100 49 C118 49 128 54 130 64 C126 56 116 51 100 51 C84 51 74 56 70 64 C72 54 82 49 100 49 Z" fill="${darken(c, 0.16)}"/>`,
  }),
  bob: (c) => ({
    back: `<path d="M52 84 C46 50 68 26 100 26 C132 26 154 50 148 84 L148 116 L132 122 C140 92 130 56 100 56 C70 56 60 92 68 122 L52 116 Z" fill="${c}"/>`,
    front: `<path d="M58 78 C54 44 74 26 100 26 C126 26 146 44 142 78 C138 60 128 50 100 50 C72 50 62 60 58 78 Z" fill="${darken(c, 0.06)}"/>`,
  }),
}

const eye = (cx, color) => `
  <ellipse cx="${cx}" cy="97" rx="11" ry="8" fill="#ffffff"/>
  <circle cx="${cx + 1}" cy="97" r="6" fill="${color}"/>
  <circle cx="${cx + 1}" cy="97" r="3" fill="#1a1526"/>
  <circle cx="${cx + 3}" cy="94.5" r="1.9" fill="#ffffff"/>`

const build = (cfg) => {
  const { bg, skin, hair, sweater, eye: eyeColor, style } = cfg
  const skinSh = darken(skin, 0.10)
  const skinDeep = darken(skin, 0.18)
  const sweaterDk = darken(sweater, 0.28)
  const brow = darken(hair, 0.12)
  const h = HAIR[style](hair)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<rect width="200" height="200" fill="${bg}"/>
<path d="M40 200 C40 174 60 164 100 164 C140 164 160 174 160 200 Z" fill="${sweater}"/>
<path d="M84 138 h32 v20 c0 9 -7 14 -16 14 s-16 -5 -16 -14 z" fill="${skin}"/>
<path d="M76 140 C86 156 114 156 124 140 L124 150 C114 162 86 162 76 150 Z" fill="${skinDeep}"/>
<path d="M92 166 L108 166 L100 186 Z" fill="#f3f3f3"/>
<path d="M70 172 L100 200 L130 172 L124 167 L100 190 L76 167 Z" fill="${sweaterDk}"/>
${h.back}
<ellipse cx="61" cy="106" rx="10" ry="12" fill="${skin}"/>
<ellipse cx="139" cy="106" rx="10" ry="12" fill="${skin}"/>
<ellipse cx="61" cy="106" rx="4" ry="6" fill="${skinSh}"/>
<ellipse cx="139" cy="106" rx="4" ry="6" fill="${skinSh}"/>
<path d="M100 38 C73 38 62 62 62 92 C62 122 77 150 100 152 C123 150 138 122 138 92 C138 62 127 38 100 38 Z" fill="${skin}"/>
<path d="M100 38 C127 38 138 62 138 92 C138 122 123 150 100 152 Z" fill="${skinSh}" opacity="0.55"/>
${h.front}
<path d="M70 83 C78 77 91 78 95 83 C90 80 80 80 71 86 Z" fill="${brow}"/>
<path d="M130 83 C122 77 109 78 105 83 C110 80 120 80 129 86 Z" fill="${brow}"/>
${eye(83, eyeColor)}
${eye(117, eyeColor)}
<path d="M100 100 L92 120 C95 124 105 124 108 120 Z" fill="${skinSh}"/>
<ellipse cx="95" cy="120" rx="1.6" ry="1.2" fill="${skinDeep}"/>
<ellipse cx="105" cy="120" rx="1.6" ry="1.2" fill="${skinDeep}"/>
<ellipse cx="80" cy="112" rx="6" ry="4" fill="${darken(skin, 0.05)}" opacity="0.5"/>
<ellipse cx="120" cy="112" rx="6" ry="4" fill="${darken(skin, 0.05)}" opacity="0.5"/>
<path d="M88 132 C94 138 106 138 112 132" stroke="#a2564a" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`
}

const CONFIGS = {
  men_1: { bg: '#3E9B94', skin: '#F3C6A0', hair: '#20242E', sweater: '#16233F', eye: '#3A4A63', style: 'spiky' },
  men_2: { bg: '#5C79A8', skin: '#E7B48B', hair: '#3B2A20', sweater: '#2E7D5B', eye: '#5A3B26', style: 'short' },
  men_3: { bg: '#D98A48', skin: '#C88A52', hair: '#1B1B1B', sweater: '#37474F', eye: '#2B2B2B', style: 'buzz' },
  men_4: { bg: '#7E68B0', skin: '#F3C6A0', hair: '#5A3720', sweater: '#4A3B7A', eye: '#3A4A63', style: 'curly' },
  men_5: { bg: '#4DA1A9', skin: '#9C6B43', hair: '#141414', sweater: '#14343A', eye: '#2B2B2B', style: 'sidepart' },
  women_1: { bg: '#E28BA8', skin: '#F3C6A0', hair: '#2A1E18', sweater: '#B23A6A', eye: '#4A3226', style: 'long' },
  women_2: { bg: '#A876C4', skin: '#E7B48B', hair: '#5A3720', sweater: '#7E3FA0', eye: '#5A3B26', style: 'longwavy' },
  women_3: { bg: '#E6B23F', skin: '#C88A52', hair: '#1B1B1B', sweater: '#4E4030', eye: '#2B2B2B', style: 'bun' },
  women_4: { bg: '#6C7BC4', skin: '#F3C6A0', hair: '#9C2C55', sweater: '#3C4A94', eye: '#3A4A63', style: 'pixie' },
  women_5: { bg: '#3FA58C', skin: '#9C6B43', hair: '#141414', sweater: '#1F5A50', eye: '#2B2B2B', style: 'bob' },
}

export const PRESET_AVATARS = Object.fromEntries(
  Object.entries(CONFIGS).map(([key, cfg]) => [key, build(cfg)]),
)

export const presetSrc = key => (key ? PRESET_AVATARS[key] || null : null)
export const MEN = ['men_1', 'men_2', 'men_3', 'men_4', 'men_5'].map(key => ({ key, src: PRESET_AVATARS[key] }))
export const WOMEN = ['women_1', 'women_2', 'women_3', 'women_4', 'women_5'].map(key => ({ key, src: PRESET_AVATARS[key] }))
