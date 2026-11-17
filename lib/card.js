// 每日天气卡：按 notes/design/weather-card-brief.md（v1）落地 720×980 的 SVG。
//
// 只负责「长什么样」；取数/话术在 weather.js / care.js。
// 三条口径（一角定死，别再改）：
//   · 早/晚只看**结构**：本地时间 >= 05:30 且 < 17:30 算早版，其余算晚版；
//   · 深/浅只看**宿主主题**：默认深色，主题是浅色才出浅色；四象限都要能跑；
//   · 一条地平线是这套卡的签名：轨道 + cool→warm 区间段 + 「现在」点。

import { outfitFor } from './care.js';
import { festivalOf } from './festivals.js';

const W = 720;
const H = 980;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 品牌名：须与 locale/zh.json 的 meta.title 保持一致（「天气关心」是功能名，别混用）
const BRAND = '小鲸鱼关心';

// BRIEF §3 的字体栈：拉丁在前、中文在后，顺序不要改。
const FONT = '-apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

// BRIEF §3 的字号阶梯：25 级不许再出现小于 28 的字。
const SIZE = { h1: 168, h2: 64, h3: 44, body: 36, label: 28 };

const EARLY_FROM = 5 * 60 + 30;   // 05:30:00 归早版
const LATE_FROM = 17 * 60 + 30;   // 17:30:00 归晚版

// BRIEF §2：深/浅是同一色相角的两套明度，只换明暗，不换色相。
const THEMES = {
  dark: {
    bgTop: '#091520',
    bgBottom: '#12283A',
    wash: null,
    surface: '#152A3B',
    rule: '#22384A',
    ink: '#EDF4F9',
    ink2: '#A9BCCA',
    cool: '#6FD3F2',
    warm: '#FFB877',
    alert: '#FF6F61',
    glowEarly: { cx: 640, cy: 1020, r: 480, color: '#FFB877', opacity: 0.08 },
    glowLate: { cx: 60, cy: 120, r: 420, color: '#6FD3F2', opacity: 0.06 },
  },
  light: {
    bgTop: '#F6F1E8',
    bgBottom: '#F6F1E8',
    wash: { cx: 600, cy: 900, r: 420, color: '#E3ECF2', opacity: 0.12 },
    surface: '#FFFDF8',
    rule: '#DCD5C7',
    ink: '#152230',
    ink2: '#4E6175',
    cool: '#0B7290',
    warm: '#A9530C',
    alert: '#B3352B',
    glowEarly: null,
    glowLate: null,
  },
};

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

/** 按字数截断（BRIEF §3：超字换行或截断，不许缩字号）。 */
const fit = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
};

/** 温度只写整数 + °，不带 °C、不加空格。 */
const deg = (value) => (value == null || !Number.isFinite(Number(value)) ? '' : Math.round(Number(value)) + '°');

const isNum = (value) => value != null && Number.isFinite(Number(value));

// ── 质感 A · 哑光纸（notes/design/2026-11-18-texture-v2.md §4）──────────
// 表皮全部落在「内侧 1px」与低透明度均匀明度上：只有 linearGradient / radialGradient，
// 一个 filter 都没有（§8：默认方案 0 个 filter 是本次交付最硬的一条性质）。
// 数值见 §14.2：深色靠提亮造光，浅色靠压暗造影（白纸没法比白纸更白，白 3% 在浅底只有 Δ0.3）。
const SKIN = {
  tonePad: 10,      // 台阶比数据带上下各多 10px
  topPx: 40,        // 顶部坡的高度（这段是边距，无字）
  rimTop: 0.5,      // 顶收口：卡自己最外一行（框的外描边画在这一行之外，§14.3 一行一层）
  rimBottom: 979.5, // 底收口：卡自己最外一行
  dark: {
    topAlpha: 0.03,                              // 顶部坡：白 0→3%
    tone: { color: '#FFFFFF', alpha: 0.015 },    // 数据带：白 1.5%（提亮）
    topRim: { color: '#FFFFFF', alpha: 0.04 },   // 顶亮线
    bottomRim: { color: '#04121C', alpha: 1 }, // 底暗线：6% 实测 Δ2.0 = 空操作；22% 在 0.5× 下又只剩半个像素，取 #04121C
  },
  light: {
    topAlpha: 0,                                 // 顶部坡：删（浅底 Δ0.3，写法是假的）
    tone: { color: '#000000', alpha: 0.025 },    // 数据带：黑 2.5% = #F0EBE2（压暗）
    topRim: { color: '#FFFFFF', alpha: 0.70 },   // 顶亮线 = #FCFBF8
    bottomRim: { color: '#000000', alpha: 0.08 },// 底暗线 = #E2DED5（上限 8%）
  },
};

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (channels) => '#' + channels.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const lerpRgb = (from, to, t) => from.map((v, i) => v + (to[i] - v) * t);

/** 中文字宽估计：CJK / 全角标点 1em，数字与拉丁半角；只用于折行。 */
function charW(ch, size) {
  const code = ch.codePointAt(0);
  if (code >= 0x2e80 && code <= 0xa4cf) return size;
  if (code >= 0x3000 && code <= 0x303f) return size;
  if (code >= 0xff00 && code <= 0xff60) return size;
  if (code === 0x20) return size * 0.28;
  if (code >= 0x30 && code <= 0x39) return size * 0.56;
  if (code >= 0x21 && code <= 0x7e) return size * 0.55;
  return size * 0.6;
}

const textWidth = (value, size) => [...String(value)].reduce((sum, ch) => sum + charW(ch, size), 0);

// BRIEF §9 改成「建议单行、装不下就删条」，所以不再需要折行；保留宽度度量给断言用。
const phaseOf = (now) => {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= EARLY_FROM && minutes < LATE_FROM ? 'early' : 'late';
};

/**
 * @param {number} x
 * @param {number} y
 * @param {string|number} value
 * @param {{ size?: number, fill?: string, weight?: number, anchor?: string, spacing?: number }} [opts]
 */
function textNode(x, y, value, opts = {}) {
  const { size = SIZE.body, fill, weight = 400, anchor, spacing } = opts;
  const attrs = [
    'x="' + x + '"',
    'y="' + y + '"',
    'font-size="' + size + '"',
    fill ? 'fill="' + fill + '"' : '',
    weight !== 400 ? 'font-weight="' + weight + '"' : '',
    anchor ? 'text-anchor="' + anchor + '"' : '',
    spacing ? 'letter-spacing="' + spacing + '"' : '',
  ].filter(Boolean).join(' ');
  return '<text ' + attrs + '>' + esc(value) + '</text>';
}

// ── 图标（BRIEF §5.2）：线性、不填色，笔画 3（720 空间），48 框、内边距 6 ──
function icon(name, x, y, size, palette) {
  const k = size / 48;
  const stroke = 3 / k; // 让最终笔画恒为 3px
  const paths = [];
  const add = (d) => paths.push('<path d="' + d + '"/>');
  const line = (x1, y1, x2, y2) => paths.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>');

  if (name === 'sun') {
    paths.push('<circle cx="24" cy="24" r="9" fill="none"/>');
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI / 4) * i;
      const x1 = 24 + Math.cos(a) * 15;
      const y1 = 24 + Math.sin(a) * 15;
      const x2 = 24 + Math.cos(a) * 21;
      const y2 = 24 + Math.sin(a) * 21;
      line(x1.toFixed(2), y1.toFixed(2), x2.toFixed(2), y2.toFixed(2));
    }
  } else if (name === 'cloud') {
    add('M14 32 H34 A8 8 0 0 0 34 16 A11 11 0 0 0 13 18 A7 7 0 0 0 14 32 Z');
  } else if (name === 'rain') {
    add('M14 30 H34 A8 8 0 0 0 34 14 A11 11 0 0 0 13 16 A7 7 0 0 0 14 30 Z');
    line(17, 34, 13, 41);
    line(25, 34, 21, 41);
    line(33, 34, 29, 41);
  } else if (name === 'wind') {
    line(10, 18, 38, 18);
    line(12, 25, 34, 25);
    add('M10 32 H26 A4 4 0 0 0 26 24');
  } else if (name === 'haze') {
    for (const yLine of [18, 25, 32]) {
      paths.push('<line x1="10" y1="' + yLine + '" x2="38" y2="' + yLine + '" stroke-dasharray="6 6"/>');
    }
  } else {
    // 夜间：晴 / 多云 合并成「云月」
    paths.push('<circle cx="33" cy="14" r="6" fill="none"/>');
    add('M11 31 H29 A7 7 0 0 0 29 17 A9 9 0 0 0 13 19 A6 6 0 0 0 11 31 Z');
  }

  return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')" fill="none" stroke="' + palette.ink2
    + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round">' + paths.join('') + '</g>';
}

/** 描述 → 符号（BRIEF §5.2 只允许这 5 个符号，夜间合并成云月）。 */
function symbolOf(desc, late) {
  const d = String(desc ?? '');
  if (/雨|雪/.test(d)) return 'rain';
  if (/霾|沙|尘|雾/.test(d)) return 'haze';
  if (/风/.test(d)) return 'wind';
  if (/晴/.test(d)) return late ? 'cloud-moon' : 'sun';
  return late ? 'cloud-moon' : 'cloud';
}

// BRIEF §9：每条建议必须单行；x=76 起、右界 672 → 596px 可用，
// 15.5 全角当量 × 36 = 558 是硬顶（剩下 38px 是留给 Noto 比 PingFang 宽 2–3% 的）。
const ADVICE_MAX_WIDTH = 558;

/** 建议候选（按影响排序）。装不下的那条在渲染侧按顺序丢掉，不截断、不补第 4 行。 */
function adviceCandidates(data, profile = {}) {
  const today = data?.days?.[0];
  const air = data?.air;
  const lines = [];

  if (today && isNum(today.max)) lines.push('白天' + outfitFor(today.max, profile).day);
  if (today && today.desc && /雨/.test(String(today.desc))) lines.push('今天' + today.desc + '，出门带把伞');
  else if (isNum(today?.rain) && Number(today.rain) >= 40) lines.push('今天有雨 ' + Math.round(Number(today.rain)) + '%，出门带把伞');
  if (isNum(air?.aqi) && Number(air.aqi) >= 61) lines.push('空气 AQI ' + air.aqi + '，出门戴口罩');
  else if (isNum(today?.wind) && Number(today.wind) >= 30) lines.push('风 ' + today.wind + 'km/h，围巾戴上');
  return lines;
}

/**
 * 皮肤三层：底色渐变（顶部坡折进 stop 里）、均匀明度台阶、顶/底收口（§14.2 / §14.3 数值）。
 * 日卡与周卡共用；台阶只在有数据带时传 tone，周卡没有数据带 → 不画（规格 §1 质感）。
 * @param {{ theme: 'dark'|'light', palette: any, tone?: { top: number, bottom: number } | null }} input
 * @returns {{ bgGradient: string, toneLayer: string, rims: string }}
 */
export function buildCardSkin({ theme, palette, tone = null }) {
  const p = palette;
  const skin = SKIN[theme];
  // 底色渐变本来就铺满全卡，顶部 40px 的白坡折进它的 stop 里（少一层矩形、也不改几何）：
  // y=0 白 0% → y=40 白 3%，40 处硬落回底色 —— §4 的「只有顶部有坡」。
  const bgFrom = rgbOf(p.bgTop);
  const bgTo = rgbOf(p.bgBottom);
  const bgAt = (y) => lerpRgb(bgFrom, bgTo, y / H);
  const slopeEdge = Number((SKIN.topPx / H).toFixed(4));
  const bgStops = skin.topAlpha > 0
    ? [
      [0, hexOf(bgAt(0))],
      [slopeEdge, hexOf(lerpRgb(bgAt(SKIN.topPx), [255, 255, 255], skin.topAlpha))],
      [slopeEdge, hexOf(bgAt(SKIN.topPx))],
      [1, hexOf(bgAt(H))],
    ]
    : [[0, hexOf(bgAt(0))], [1, hexOf(bgAt(H))]];
  const bgGradient = '<linearGradient id="' + theme + '-bg" x1="0" y1="0" x2="0" y2="1">'
    + bgStops.map(([offset, color]) => '<stop offset="' + offset + '" stop-color="' + color + '"/>').join('')
    + '</linearGradient>';

  // 数据带均匀明度台阶（均匀明度不是纹理，允许铺到字底下，§10）
  const toneLayer = tone
    ? '<rect x="0" y="' + tone.top + '" width="' + W + '" height="' + (tone.bottom - tone.top)
      + '" fill="' + skin.tone.color + '" opacity="' + skin.tone.alpha + '"/>'
    : '';

  // 收口（§14.3 一行一层）：卡自己的顶亮线占第 0 行、底暗线占第 979 行，图框的外描边画在它们之外一行。
  // 不能把外描边压到卡身上：实测 14% 深线落在 #091520 上只有 Δ1.6/255，等于隐身 —— 两条线各占一行才有「外深内亮」
  const rims = '<line x1="0" y1="' + SKIN.rimTop + '" x2="' + W + '" y2="' + SKIN.rimTop + '" stroke="' + skin.topRim.color
    + '" stroke-opacity="' + skin.topRim.alpha + '" stroke-width="1"/>'
    + '<line x1="0" y1="' + SKIN.rimBottom + '" x2="' + W + '" y2="' + SKIN.rimBottom + '" stroke="' + skin.bottomRim.color
    + '" stroke-opacity="' + skin.bottomRim.alpha + '" stroke-width="1"/>';

  return { bgGradient, toneLayer, rims };
}

/**
 * @param {object} data fetchWeather 的结构
 * @param {object} profile 偏好
 * @param {{now?:Date, theme?:'dark'|'light'}} opts
 * @returns {string} SVG
 */
export function buildWeatherCardSvg(data = {}, profile = {}, opts = {}) {
  const now = opts.now ?? new Date();
  const theme = opts.theme === 'light' ? 'light' : 'dark';
  const p = THEMES[theme];
  const phase = phaseOf(now);
  const late = phase === 'late';

  const cur = data?.now && typeof data.now === 'object' ? data.now : {};
  const today = data?.days?.[0] ?? null;
  const tomorrow = data?.days?.[1] ?? null;
  const air = data?.air ?? null;
  const place = fit(data?.place || profile?.city || '这里', 10);
  const desc = fit(cur.desc || today?.desc || '', 6);
  const festival = festivalOf(now);
  const dateText = (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · ' + WEEKDAYS[now.getDay()]
    + (festival?.name ? ' · ' + festival.name : '');

  const nodes = [];

  // 头（40–150）
  nodes.push(textNode(48, 92, dateText, { size: SIZE.label, fill: p.ink2 }));
  nodes.push(textNode(48, 140, place, { size: SIZE.h3, fill: p.ink, weight: 600 }));
  nodes.push(icon(symbolOf(desc, late), 600, 56, 64, p));

  // 主区
  const tempY = late ? 400 : 420;
  if (desc) nodes.push(textNode(48, 214, desc, { size: SIZE.h3, fill: p.ink2, weight: 600 }));
  if (isNum(cur.temp)) nodes.push(textNode(40, tempY, deg(cur.temp), { size: SIZE.h1, fill: p.ink, weight: 700, spacing: -4 }));

  // 地平线（BRIEF §5.1）：轨道 + cool→warm 区间段 +「现在」点
  const trackY = late ? 450 : 474;
  const minX = 48;
  const maxX = 672;
  const span = maxX - minX;
  const hasRange = today && isNum(today.min) && isNum(today.max);
  const min = hasRange ? Number(today.min) : null;
  const max = hasRange ? Number(today.max) : null;

  if (hasRange) {
    nodes.push('<line x1="' + minX + '" y1="' + trackY + '" x2="' + maxX + '" y2="' + trackY
      + '" stroke="' + p.rule + '" stroke-width="8" stroke-linecap="round"/>');
    const rangeId = theme + '-range';
    nodes.push('<line x1="' + minX + '" y1="' + trackY + '" x2="' + maxX + '" y2="' + trackY
      + '" stroke="url(#' + rangeId + ')" stroke-width="8" stroke-linecap="round"/>');

    // 「现在」在区间里的位置：两头钳制，越界就贴边
    const nowX = isNum(cur.temp) && max > min
      ? minX + Math.max(0, Math.min(1, (Number(cur.temp) - min) / (max - min))) * span
      : minX + span / 2;

    if (!late) {
      // 早版：还没走完 —— 「现在」右侧盖 40% 遮罩 + 3 道 6px 虚刻
      if (nowX < maxX) {
        nodes.push('<line x1="' + nowX.toFixed(1) + '" y1="' + trackY + '" x2="' + maxX + '" y2="' + trackY
          + '" stroke="' + (theme === 'light' ? p.bgTop : p.bgTop) + '" stroke-width="8" stroke-linecap="round" stroke-opacity="0.4"/>');
        for (let i = 1; i <= 3; i += 1) {
          const tickX = nowX + ((maxX - nowX) * i) / 4;
          nodes.push('<line x1="' + tickX.toFixed(1) + '" y1="' + (trackY - 3) + '" x2="' + tickX.toFixed(1)
            + '" y2="' + (trackY + 3) + '" stroke="' + p.bgTop + '" stroke-width="6"/>');
        }
      }
    } else if (tomorrow && isNum(tomorrow.max)) {
      // 晚版：右端 2px 明日温度 tick（已经走完）
      nodes.push('<line x1="' + (maxX - 1) + '" y1="' + (trackY - 12) + '" x2="' + (maxX - 1) + '" y2="' + (trackY + 12)
        + '" stroke="' + p.warm + '" stroke-width="2"/>');
    }

    nodes.push('<circle cx="' + nowX.toFixed(1) + '" cy="' + trackY + '" r="8" fill="' + p.ink
      + '" stroke="' + p.bgTop + '" stroke-width="4"/>');
    nodes.push(textNode(minX, late ? 492 : 516, deg(min), { size: SIZE.label, fill: p.ink2 }));
    nodes.push(textNode(maxX, late ? 492 : 516, deg(max), { size: SIZE.label, fill: p.ink2, anchor: 'end' }));
  }

  // 晚版：「明天」通栏（520–600）
  if (late && tomorrow && (isNum(tomorrow.min) || isNum(tomorrow.max))) {
    nodes.push(textNode(48, 592, '明天', { size: SIZE.body, fill: p.ink2 }));
    const tomorrowText = (isNum(tomorrow.min) ? Math.round(Number(tomorrow.min)) : '') + '~'
      + (isNum(tomorrow.max) ? Math.round(Number(tomorrow.max)) : '') + '°';
    nodes.push(textNode(48 + textWidth('明天', SIZE.body) + 20, 592, tomorrowText, { size: SIZE.h2, fill: p.ink, weight: 700 }));
  }

  // 数据带（早 590–670 / 晚 630–710）：三格，竖线只在两格之间
  const bandTop = late ? 640 : 600;
  const bandBottom = late ? 700 : 660;
  const labelY = late ? 660 : 620;
  const valueY = late ? 704 : 664;
  const cells = [];
  if (hasRange) cells.push({ label: '温差', value: Math.round(max - min) + '°' });
  if (isNum(today?.rain)) cells.push({ label: '降雨', value: Math.round(Number(today.rain)) + '%' });
  if (isNum(air?.aqi)) cells.push({ label: '空气', value: String(air.aqi) });

  cells.slice(0, 3).forEach((cell, index) => {
    const x = [48, 256, 464][index];
    if (index > 0) {
      const ruleX = [248, 456][index - 1];
      nodes.push('<line x1="' + ruleX + '" y1="' + bandTop + '" x2="' + ruleX + '" y2="' + bandBottom
        + '" stroke="url(#' + theme + '-rule-fade)" stroke-width="1"/>');
    }
    nodes.push(textNode(x, labelY, cell.label, { size: SIZE.label, fill: p.ink2 }));
    nodes.push(textNode(x, valueY, cell.value, { size: SIZE.h3, fill: p.ink, weight: 600 }));
  });



  // 建议（BRIEF §9）：每条必须单行；装不下的那条按影响顺序删掉，不截断、不加第 4 行。
  const baselines = late ? [776, 832, 888] : [736, 792, 848];
  const advice = [];
  for (const line of adviceCandidates(data, profile)) {
    if (advice.length >= 3) break;
    if (textWidth(line, SIZE.body) > ADVICE_MAX_WIDTH) continue;
    advice.push(line);
  }
  if (advice.length) {
    // 竖线长度 = n×56 + 12（BRIEF §9）；AQI ≥ 100 时整根线换 alert 色，不添第二条线
    const barLength = advice.length * 56 + 12;
    const barColor = isNum(air?.aqi) && Number(air.aqi) >= 100 ? p.alert : p.warm;
    nodes.push('<line x1="48" y1="' + (baselines[0] - 36) + '" x2="48" y2="' + (baselines[0] - 36 + barLength)
      + '" stroke="' + barColor + '" stroke-width="4" stroke-linecap="round"/>');
    advice.forEach((line, index) => {
      nodes.push(textNode(76, baselines[index], line, { size: SIZE.body, fill: p.ink }));
    });
  }

  // 脚：早版带明日一行 + 来源；晚版只有来源
  if (!late && tomorrow && (isNum(tomorrow.min) || isNum(tomorrow.max))) {
    nodes.push(textNode(48, 902, '明天 ' + Math.round(Number(tomorrow.min)) + '~' + Math.round(Number(tomorrow.max)) + '° ' + fit(tomorrow.desc || '', 4),
      { size: SIZE.body, fill: p.ink2 }));
  }
  nodes.push(textNode(48, 936, BRAND + ' · ' + place, { size: SIZE.label, fill: p.ink2 }));

  // ── 表皮 A · 哑光纸：顶坡 / 收口 / 数据带台阶 ─────────────────────────
  // 皮肤三层（底色渐变 / 数据带台阶 / 顶底收口）和周卡共用，见 buildCardSkin()。
  const { bgGradient, toneLayer, rims } = buildCardSkin({
    theme,
    palette: p,
    tone: { top: bandTop - SKIN.tonePad, bottom: bandBottom + SKIN.tonePad },
  });

  // 数据带 3 格竖线改为竖向渐隐（两端 0 / 中间 1，§4 ③）
  const ruleFade = '<linearGradient id="' + theme + '-rule-fade" gradientUnits="userSpaceOnUse" x1="0" y1="' + bandTop
    + '" x2="0" y2="' + bandBottom + '"><stop offset="0" stop-color="' + p.rule + '" stop-opacity="0"/>'
    + '<stop offset="0.5" stop-color="' + p.rule + '" stop-opacity="1"/>'
    + '<stop offset="1" stop-color="' + p.rule + '" stop-opacity="0"/></linearGradient>';

  // 光斑：位置 / 半径 / 颜色不变，实心圆换成径向衰减 —— 去掉那圈 1px 硬边（缺陷修复，与方向无关）。
  // 衰减只做在边缘一圈（GLOW_EDGE→1）而不是整幅：Chrome 会给大面积低透明度渐变加抖动，
  // 整幅衰减会把卡图从 217KB 顶到 444KB（单图上限 300KB，见回执实测）；
  // 边缘带的斜率也足够 —— 原来 1 像素掉 12/255，现在摊到约 17px 上，肉眼已是柔边。
  const glow = theme === 'dark' ? (late ? p.glowLate : p.glowEarly) : p.wash;
  const GLOW_EDGE = 0.96;
  const glowGradient = glow
    ? '<radialGradient id="' + theme + '-glow" gradientUnits="userSpaceOnUse" cx="' + glow.cx + '" cy="' + glow.cy
      + '" r="' + glow.r + '"><stop offset="0" stop-color="' + glow.color + '" stop-opacity="' + glow.opacity + '"/>'
      + '<stop offset="' + GLOW_EDGE + '" stop-color="' + glow.color + '" stop-opacity="' + glow.opacity + '"/>'
      + '<stop offset="1" stop-color="' + glow.color + '" stop-opacity="0"/></radialGradient>'
    : '';
  const glowLayer = glow
    ? '<circle cx="' + glow.cx + '" cy="' + glow.cy + '" r="' + glow.r + '" fill="url(#' + theme + '-glow)"/>'
    : '';

  const rangeGradient = '<linearGradient id="' + theme + '-range" gradientUnits="userSpaceOnUse" x1="48" y1="0" x2="672" y2="0">'
    + '<stop offset="0" stop-color="' + p.cool + '"/><stop offset="1" stop-color="' + p.warm + '"/></linearGradient>';

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H
    + '" font-family="' + FONT.replace(/"/g, '&quot;') + '">'
    + '<defs>' + bgGradient + rangeGradient + ruleFade + glowGradient + '</defs>'
    + '<rect width="' + W + '" height="' + H + '" fill="url(#' + theme + '-bg)"/>'
    + toneLayer
    + glowLayer
    + nodes.join('')
    + rims
    + '</svg>';
}

export const CARD_SIZE = { width: W, height: H };
// 周卡（lib/card-week.js）复用同一套视觉口径，别再各写一份
export const CARD_THEMES = THEMES;
export const CARD_FONT = FONT;
export const CARD_TEXT_SIZE = SIZE;
export const CARD_BRAND = BRAND;
export const cardTextNode = textNode;
export const CARD_PHASE = { earlyFrom: EARLY_FROM, lateFrom: LATE_FROM };
// 给单测用的度量口径：建议区硬顶 558px 与中文字宽估计（BRIEF §9）
export const CARD_ADVICE_MAX_WIDTH = ADVICE_MAX_WIDTH;
export const measureCardText = (value, size = SIZE.body) => textWidth(value, size);
