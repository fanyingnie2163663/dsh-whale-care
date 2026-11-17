// 生成 README 素材图：C 天气卡 / D 提醒时间轴 / B 对比图原地重导出。
// 用法：node scripts/render-readme-assets.mjs
//
// 规格来自 notes/design/2026-11-18-readme-visual.md §4 与 notes/design/2026-11-18-texture-v2.md §4：
//   · §4.2 一套框：四角填 #F6F8FB（不透明）、圆角视觉 12px（720 坐标 24 / 1440 文件像素 48 / B 文件 24）、
//     内侧 1px rgba(21,42,59,0.12) 描边、无阴影；
//   · 质感 A 把框升级为「内外双描边 + 4 层阶梯投影」：投影 dy 6/9/12/15、透明度 7/5/3/2%、色 #152A3B，
//     纯属性圆角矩形叠加（§8#4「阶梯投影 = 纯属性」），**不开任何 filter**。
//     投影要落在卡片外面，所以画布四周留白 PAD=24，三张图同一处理。
//   · §4.3 图 C 是 lib/card.js 的真实渲染；图 D 是时间轴版（1px 轴 / 8px 节点 / 28px 时间 / 32px 正文 / 行距 48）；
//   · §4.4 数据冻结：合肥 · 2026-11-03 · 阿宁 · 怕冷 / 骑车 / 有鼻炎。
// 文案底线：图里每句话都能指回 lib/ 里的代码或真实模板，脚本不写话术。
// 渲染：headless Chrome 截图（C、D 用 2x；B 用 1x 保持 1280 内容宽），中间文件只写系统临时目录。

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { CARD_SIZE, buildWeatherCardSvg } from '../lib/card.js';
import { evaluateWeatherReminder, sanitizeReminder } from '../lib/reminders.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');

const W = CARD_SIZE.width;
const H = CARD_SIZE.height;

// 图 D 的画布（720×360，@2x 导出 1440×720）。
const D_W = 720;
const D_H = 360;

// 图 B 的原始画面（1280×720，1x 导出，README 里按 640 显示）。
const B_W = 1280;
const B_H = 720;

// 一套框（质感 A）
const FRAME_RADIUS = 24;        // 720 坐标；导出后会变成 48 文件像素，正好是「视觉 12px」
const PAD = 24;                 // 画布四周留白，给投影落下来（@2x 等于 48 文件像素）
const CORNER = '#F6F8FB';       // 圆角外侧填充，不透明
const STROKE_COLOR = '#152a3b';
const OUTER_STROKE_OPACITY = '0.14';
const INNER_STROKE_OPACITY = '0.55';
const TOP_ARC_OPACITY = '0.18';
// 4 层阶梯投影：越远的层越淡，叠出「放在纸上」的落影（§4，纯属性）
const SHADOW = [
  { dy: 6, opacity: 0.07 },
  { dy: 9, opacity: 0.05 },
  { dy: 12, opacity: 0.03 },
  { dy: 15, opacity: 0.02 },
];

// 与 lib/card.js 的字体栈同义（Windows 上先落到微软雅黑，服务器上仍会落到 Noto）。
const FONT = 'Segoe UI, Microsoft YaHei, PingFang SC, Noto Sans CJK SC, sans-serif';

// 图 D 的配色：BRIEF §4.2 指定的深色底与两级墨色（不另起一套蓝）。
const D = {
  bgTop: '#091520',
  bgBottom: '#12283A',
  ink: '#EDF4F9',
  ink2: '#A9BCCA',
  cool: '#6FD3F2',
  rule: '#22384A',
};

// ── 冻结快照（BRIEF §4.4） ─────────────────────────────────────────────
// 合肥 · 2026-11-03 · 阿宁 · 怕冷 / 骑车 / 有鼻炎。
// 数字取自仓库里已发布的对比图 assets/screenshot-compare.png（96% / 体感 12.9°C / 湿度 78% /
// AQI 83 / 今天 13.2~19°C / 明天降雨 100%），三张图才对得上；该图没展示的字段（风力、明日区间、UV）
// 取的是不改变任何一句建议文案的值。
const SAMPLE_NOW = new Date(2026, 10, 3, 20, 0); // 本地 20:00：任何时区都落在 2026-11-03 晚时段（图 C 要晚版）
const SAMPLE_DATA = {
  place: '合肥',
  now: { temp: 13.8, feels: 12.9, desc: '多云', humidity: 78, uv: 2, wind: 18 },
  air: { aqi: 83, pm25: 62 },
  days: [
    { label: '今天', date: '11-03', min: 13.2, max: 19, desc: '多云', rain: 96, wind: 18, precip: 0, hours: {} },
    { label: '明天', date: '11-04', min: 9, max: 15, desc: '阴', rain: 100, wind: 24, precip: 2, hours: {} },
  ],
};
const SAMPLE_PROFILE = { city: '合肥', nickname: '阿宁', coldSensitive: true, commute: 'bike', notes: '有鼻炎' };

// 品牌名：与 lib/card.js 的 BRAND 一致（图 C 由 card.js 自己渲染，图 D 的页脚用它）。
const BRAND = '小鲸鱼关心';

const pad2 = (value) => String(value).padStart(2, '0');
const SAMPLE_DAY = SAMPLE_NOW.getFullYear() + '-' + pad2(SAMPLE_NOW.getMonth() + 1) + '-' + pad2(SAMPLE_NOW.getDate());

const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── 一套框（质感 A） ───────────────────────────────────────────────────

const textNode = (x, y, value, attrs) => '<text x="' + x + '" y="' + y + '" ' + attrs + '>' + esc(value) + '</text>';

/**
 * 统一外框：画布四周留 PAD、四角 #F6F8FB、圆角 24、4 层阶梯投影、内外双描边、顶弧再加一道高光。
 * 只画在画布内侧，不用任何 filter。
 * @param {{ width: number, height: number, defs?: string, body: string }} job
 */
function frameSvg({ width, height, defs, body }) {
  const canvasW = width + PAD * 2;
  const canvasH = height + PAD * 2;
  const shadows = SHADOW.map((layer) => '  <rect x="' + PAD + '" y="' + (PAD + layer.dy) + '" width="' + width
    + '" height="' + height + '" rx="' + FRAME_RADIUS + '" fill="' + STROKE_COLOR + '" opacity="' + layer.opacity + '"/>');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + canvasW + '" height="' + canvasH + '" viewBox="0 0 ' + canvasW + ' ' + canvasH + '" font-family="' + FONT + '">',
    '  <defs><clipPath id="readmeFrame"><rect x="' + PAD + '" y="' + PAD + '" width="' + width + '" height="' + height + '" rx="' + FRAME_RADIUS + '"/></clipPath>' + (defs || '') + '</defs>',
    '  <rect width="' + canvasW + '" height="' + canvasH + '" fill="' + CORNER + '"/>',
    ...shadows,
    '  <g clip-path="url(#readmeFrame)"><g transform="translate(' + PAD + ' ' + PAD + ')">',
    body,
    '  </g></g>',
    // 内描边：1px 白，压在卡片内侧
    '  <rect x="' + (PAD + 0.5) + '" y="' + (PAD + 0.5) + '" width="' + (width - 1) + '" height="' + (height - 1)
      + '" rx="' + (FRAME_RADIUS - 0.5) + '" fill="none" stroke="#FFFFFF" stroke-opacity="' + INNER_STROKE_OPACITY + '" stroke-width="1"/>',
    // 上弧内侧再加 1px 高光（只在顶边直段上）
    '  <line x1="' + (PAD + FRAME_RADIUS) + '" y1="' + (PAD + 0.5) + '" x2="' + (PAD + width - FRAME_RADIUS) + '" y2="' + (PAD + 0.5)
      + '" stroke="#FFFFFF" stroke-opacity="' + TOP_ARC_OPACITY + '" stroke-width="1"/>',
    // 外描边：1px 深线，落在卡片外侧
    '  <rect x="' + (PAD - 0.5) + '" y="' + (PAD - 0.5) + '" width="' + (width + 1) + '" height="' + (height + 1)
      + '" rx="' + (FRAME_RADIUS + 0.5) + '" fill="none" stroke="' + STROKE_COLOR + '" stroke-opacity="' + OUTER_STROKE_OPACITY + '" stroke-width="1"/>',
    '</svg>',
  ].join('\n');
}

// ── 图 C：lib/card.js 真实渲染 + 一套框 ────────────────────────────────

function weatherCardJob() {
  const raw = buildWeatherCardSvg(SAMPLE_DATA, SAMPLE_PROFILE, { now: SAMPLE_NOW });

  // card.js 已经用 BRIEF §3 的字体栈（含 Microsoft YaHei），本机与服务器都能落字，不用再换。
  const svg = raw;

  const defsMatch = svg.match(/<defs>([\s\S]*?)<\/defs>/);
  assert(defsMatch, 'card.js 输出的 <defs> 没找到，卡片结构变了');
  const bodyStart = svg.indexOf('</defs>') + '</defs>'.length;
  const body = svg.slice(bodyStart, svg.lastIndexOf('</svg>'));
  assert(!/undefined|NaN/.test(body), '天气卡出现了 undefined / NaN');
  assert(!/feGaussianBlur|feTurbulence|filter=/.test(body), '天气卡里出现了 filter，质感 A 只许纯属性');

  return {
    name: 'weather-card',
    png: 'screenshot-card.png',
    svg: frameSvg({ width: W, height: H, defs: defsMatch[1], body }),
    width: W + PAD * 2,
    height: H + PAD * 2,
    scale: 2,
    note: 'buildWeatherCardSvg() 真实渲染（质感 A）',
  };
}

// ── 图 D：提醒时间轴（BRIEF §4.3） ─────────────────────────────────────

function reminderTimelineJob() {
  const umbrella = sanitizeReminder({
    id: 'readme-umbrella',
    label: '记得带伞',
    time: '07:00',
    intent: 'weather',
    weather: { type: 'rain', threshold: 40 },
  });
  const medicine = sanitizeReminder({ id: 'readme-medicine', label: '吃降压药', time: '08:00', intent: 'text' });

  // 到点那一刻用最新预报评估：这是 lib/reminders.js 的模板输出，不是手写文案。
  const hit = evaluateWeatherReminder(umbrella, SAMPLE_DATA);
  assert(hit.matched && hit.line, '天气类提醒没有命中，冻结快照变了');

  const rows = [
    { time: umbrella.time, text: hit.line },      // 07:00
    { time: medicine.time, text: medicine.label }, // 08:00
  ];

  const TIME_SIZE = 28;
  const BODY_SIZE = 32;
  const AXIS_X = 48;
  const TEXT_X = 76;
  const TIME_BASELINES = [104, 220];
  const BODY_GAP = 48;
  const NODE_R = 4;
  const FOOTER_BASELINE = 340;

  const nodes = [];
  rows.forEach((row, index) => {
    const timeY = TIME_BASELINES[index];
    const bodyY = timeY + BODY_GAP;
    const nodeY = timeY - 10;
    nodes.push('<circle cx="' + AXIS_X + '" cy="' + nodeY + '" r="' + NODE_R + '" fill="' + D.cool + '"/>');
    nodes.push(textNode(TEXT_X, timeY, row.time, 'font-size="' + TIME_SIZE + '" fill="' + D.ink2 + '" letter-spacing="1"'));
    nodes.push(textNode(TEXT_X, bodyY, row.text, 'font-size="' + BODY_SIZE + '" fill="' + D.ink + '"'));
  });

  const axisTop = TIME_BASELINES[0] - 10;
  const axisBottom = TIME_BASELINES[TIME_BASELINES.length - 1] - 10;

  const body = [
    '    <rect width="' + D_W + '" height="' + D_H + '" fill="url(#dayBg)"/>',
    '    <line x1="' + AXIS_X + '" y1="' + axisTop + '" x2="' + AXIS_X + '" y2="' + axisBottom + '" stroke="' + D.rule + '" stroke-width="1"/>',
    ...nodes.map((node) => '    ' + node),
    '    ' + textNode(48, FOOTER_BASELINE, BRAND + ' · 示例数据 · ' + SAMPLE_DATA.place + ' · ' + SAMPLE_DAY, 'font-size="16" fill="' + D.ink2 + '"'),
  ].join('\n');

  const defs = [
    '<linearGradient id="dayBg" x1="0" y1="0" x2="0" y2="1">',
    '  <stop offset="0" stop-color="' + D.bgTop + '"/>',
    '  <stop offset="1" stop-color="' + D.bgBottom + '"/>',
    '</linearGradient>',
  ].join('');

  return {
    name: 'reminder',
    png: 'screenshot-reminder.png',
    svg: frameSvg({ width: D_W, height: D_H, defs, body }),
    width: D_W + PAD * 2,
    height: D_H + PAD * 2,
    scale: 2,
    note: 'reminders.js 模板：evaluateWeatherReminder + 提醒内容（质感 A 框）',
  };
}

// ── 图 B：对比图原地重导出（只换框，画面内容一个字不改） ────────────────

function compareJob(base64) {
  return {
    name: 'compare',
    png: 'screenshot-compare.png',
    svg: frameSvg({
      width: B_W,
      height: B_H,
      defs: '',
      body: '    <image x="0" y="0" width="' + B_W + '" height="' + B_H + '" preserveAspectRatio="none" href="data:image/png;base64,' + base64 + '"/>',
    }),
    width: B_W + PAD * 2,
    height: B_H + PAD * 2,
    scale: 1,
    note: '原地重导出：画面不动，只换质感 A 的框',
  };
}

// ── PNG 自检（无依赖：只解第一行第一像素，用来验证圆角外侧填色） ──────────

function pngInfo(buffer) {
  assert(buffer.length > 33 && buffer.subarray(1, 4).toString('latin1') === 'PNG', '不是 PNG');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  let firstPixel = null;
  if (bitDepth === 8 && (colorType === 2 || colorType === 6)) {
    const idat = [];
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('latin1', offset + 4, offset + 8);
      if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
      offset += 12 + length;
      if (type === 'IEND') break;
    }
    if (idat.length) {
      // 第一行第一个像素：左/上邻居都是 0，任何一种 filter 解码出来的都是原始字节。
      const raw = zlib.inflateSync(Buffer.concat(idat));
      firstPixel = [raw[1], raw[2], raw[3]];
    }
  }
  return { width, height, bitDepth, colorType, firstPixel };
}

const isCornerFill = (pixel) => Array.isArray(pixel) && pixel[0] === 0xf6 && pixel[1] === 0xf8 && pixel[2] === 0xfb;
const hex = (pixel) => (pixel ? '#' + pixel.map((value) => value.toString(16).padStart(2, '0')).join('') : '--');
const MAX_BYTES = 300 * 1024;

// ── 渲染 ──────────────────────────────────────────────────────────────

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function renderPng(chrome, sourceFile, pngFile, width, height, scale) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-device-scale-factor=' + scale,
    '--user-data-dir=' + path.join(os.tmpdir(), 'dsh-whale-care-chrome-profile'),
    '--window-size=' + width + ',' + height,
    '--screenshot=' + pngFile,
    pathToFileURL(sourceFile).href,
  ];
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  execFileSync(chrome, args, { stdio: 'ignore', timeout: 90000 });
}

async function verifyPng(file, job) {
  const bytes = (await readFile(file)).length;
  const info = pngInfo(await readFile(file));
  assert(info.width === job.width * job.scale, job.png + ' 宽度不对：' + info.width);
  assert(info.height === job.height * job.scale, job.png + ' 高度不对：' + info.height);
  assert(info.colorType === 2, job.png + ' 不是 24 位 RGB PNG（colorType=' + info.colorType + '）');
  assert(isCornerFill(info.firstPixel), job.png + ' 四角不是 ' + CORNER + '：' + hex(info.firstPixel));
  assert(bytes <= MAX_BYTES, job.png + ' 超过 300KB：' + Math.round(bytes / 1024) + 'KB');
  return { ...info, bytes };
}

async function main() {
  const chrome = findChrome();
  assert(chrome, '找不到 Chrome；用 CHROME_PATH 指定 chrome 可执行文件');

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-whale-care-assets-'));
  await mkdir(ASSETS, { recursive: true });

  const jobs = [weatherCardJob(), reminderTimelineJob()];
  const rows = [];
  const hashes = [];

  for (const job of jobs) {
    const svgFile = path.join(tmpDir, job.name + '.svg');
    const pngFile = path.join(ASSETS, job.png);
    await writeFile(svgFile, job.svg, 'utf8');
    renderPng(chrome, svgFile, pngFile, job.width, job.height, job.scale);
    const info = await verifyPng(pngFile, job);
    rows.push({ png: job.png, size: info.width + '×' + info.height, bytes: info.bytes, note: job.note });
    hashes.push(job.png + '  ' + (await import('node:crypto')).createHash('sha256').update(await readFile(pngFile)).digest('hex'));
  }

  // 图 B：原地重导出。已经套过框（画布 = 1328×768、左上角 #F6F8FB）就跳过，重复跑不会越描越黑。
  const compareFile = path.join(ASSETS, 'screenshot-compare.png');
  const compareInfo = pngInfo(await readFile(compareFile));
  const framedW = B_W + PAD * 2;
  const framedH = B_H + PAD * 2;
  if (compareInfo.width === framedW && compareInfo.height === framedH && isCornerFill(compareInfo.firstPixel)) {
    rows.push({ png: 'screenshot-compare.png', size: framedW + '×' + framedH, bytes: (await readFile(compareFile)).length, note: '已套框，跳过重导出' });
  } else {
    assert(compareInfo.width === B_W && compareInfo.height === B_H,
      '对比图尺寸既不是 ' + B_W + '×' + B_H + ' 也不是 ' + framedW + '×' + framedH + '：' + compareInfo.width + '×' + compareInfo.height);
    const job = compareJob((await readFile(compareFile)).toString('base64'));
    const svgFile = path.join(tmpDir, 'compare.svg');
    const tempPng = path.join(tmpDir, 'compare.png');
    await writeFile(svgFile, job.svg, 'utf8');
    renderPng(chrome, svgFile, tempPng, job.width, job.height, job.scale);
    const info = await verifyPng(tempPng, job);
    await writeFile(compareFile, await readFile(tempPng));
    rows.push({ png: 'screenshot-compare.png', size: info.width + '×' + info.height, bytes: info.bytes, note: job.note });
    hashes.push('screenshot-compare.png  ' + (await import('node:crypto')).createHash('sha256').update(await readFile(compareFile)).digest('hex'));
  }

  // D2：关心版不入 README；天气卡统一叫 screenshot-card.png —— 清掉阶段一留下的旧文件名。
  const stale = ['screenshot-care.png', 'screenshot-weather-card.png'];
  for (const name of stale) {
    const file = path.join(ASSETS, name);
    if (existsSync(file)) {
      await rm(file);
      console.log('删除遗留文件：assets/' + name);
    }
  }

  await rm(tmpDir, { recursive: true, force: true });

  console.log('assets/ 已更新（' + chrome + '）：');
  for (const row of rows) {
    console.log('  ' + row.png.padEnd(30) + row.size.padEnd(12) + (Math.round(row.bytes / 1024) + 'KB').padEnd(7) + row.note);
  }
  console.log('sha256：');
  for (const line of hashes) console.log('  ' + line);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
