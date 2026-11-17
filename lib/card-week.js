// 每周回顾卡（720×980 SVG）：一个 ISO 周，两段方向。
//   温度带：今天 → 周日（往右长）；情绪线：周一 → 今天（往左长）；「今天」= 第 t 列，两张图同一个 x。
// 规格：notes/design/2026-11-18-weekly-card.md（v1.1）。
//
// 输入 = 周聚合对象（lib/weekly.js 的 buildWeeklyReview 输出）+ profile：
//   review.week / review.weather.days / review.mood.slots / review.usage / review.city
//   提醒要原始数组（opts.reminders）：「今天 18:00 → 本周日 23:59」的逐日展开在这里算（§7）。
//
// 三条硬约束（§9）：字号只有 28 / 44 两档；缺数据不画占位（不写 --、N/A、暂无、—）；
// 数据只从入参来，不读文件、不联网、不取当前时间以外的东西（同一份入参两遍渲染逐字节一致）。

import {
  CARD_BRAND, CARD_FONT, CARD_TEXT_SIZE as SIZE, CARD_THEMES, buildCardSkin, cardTextNode as text, measureCardText,
} from './card.js';
import { isScheduledToday } from './reminders.js';

// §5.3 的 7 个列中心：两条曲线共用，不许各自排
export const WEEK_COLUMNS = [92.6, 181.7, 270.9, 360.0, 449.1, 538.3, 627.4];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 区带（§4.3 + §1 的三处改动后的最终值）
// 区带 y 全部按规格 v1.1（159 行）：头 40–124 / 导语 148–256 / 温度 280–508 /
// 情绪 532–692 / 事实 716–792 / 提醒 816–892 / 脚 916–946
const HEAD_WEEK_Y = 66;        // 周序 28/ink2
const HEAD_RANGE_Y = 116;      // 区间 44/600/ink
const GUIDE_BAR = { top: 150, bottom: 244, x: 48, width: 4 };
const GUIDE_X = 76;
const GUIDE_Y = [190, 245];    // 行距 55（= §3 的 H3 1.25）
const TEMP_TOP = 300;          // 轨道 300–476（176 高），中线 388 = 两端中点
const TEMP_BOTTOM = 476;
const TEMP_MID = 388;
const TEMP_LABEL_Y = 504;
const RAIN_TOP = 508;
const RAIN_DY = 5;             // 端点 (x−2.5, 513)，伸进 508–532 的留白
const MOOD_TOP = 552;
const MOOD_BOTTOM = 668;
const MOOD_MID = 610;
const MOOD_LABEL_Y = 692;
const FACT_LABEL_Y = 744;
const FACT_VALUE_Y = 788;
const FACT_X3 = [48, 256, 464];
const FACT_X2 = [48, 360];
const FACT_MAX_WIDTH = 184;
const REMINDER_Y = [840, 872];   // 提醒区 816–892；圆点 cy = 基线−10
const FOOTER_Y = 940;

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const dateFromKey = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const mdOf = (key) => String(key ?? '').slice(5);

/** 缺失就是 null（别让 0 冒充真实温度，规格 §2 规矩 1）。 */
const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const scoreText = (value) => (Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1));

/** 按字宽截断，超出加省略号（头 14 当量、提醒行尾都用它）。 */
function fitWidth(value, size, maxWidth) {
  const chars = [...String(value ?? '')];
  if (measureCardText(chars.join(''), size) <= maxWidth) return chars.join('');
  let cut = chars.length;
  while (cut > 0 && measureCardText(chars.slice(0, cut).join('') + '…', size) > maxWidth) cut -= 1;
  return chars.slice(0, cut).join('') + '…';
}

/** §10 token 三档：843 / 12.3K / 1.2M；n ≥ 100 取整，不写 tokens、不写全角万。 */
export function formatTokens(tokens) {
  const n = num(tokens);
  if (n == null) return null;
  const v = Math.max(0, Math.round(n));
  if (v < 1000) return String(v);
  if (v < 1000000) {
    const k = v / 1000;
    return (k >= 100 ? String(Math.round(k)) : k.toFixed(1)) + 'K';
  }
  const m = v / 1000000;
  return (m >= 100 ? String(Math.round(m)) : m.toFixed(1)) + 'M';
}

/** 头区间：同月省一次月名；跨月两侧都写（§8.7）。 */
export function formatRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(end))) {
    return String(start ?? end ?? '');
  }
  const a = dateFromKey(start);
  const b = dateFromKey(end);
  if (a.getMonth() === b.getMonth()) return `${a.getMonth() + 1} 月 ${a.getDate()} – ${b.getDate()} 日`;
  return `${a.getMonth() + 1} 月 ${a.getDate()} – ${b.getMonth() + 1} 月 ${b.getDate()} 日`;
}

/** 提醒的时间表：全卡禁用 `/`，所以不用 reminders.js 的 scheduleText（§7）。 */
function scheduleLabel(item) {
  const days = Array.isArray(item?.days) ? item.days.map(Number).filter((d) => d >= 1 && d <= 7) : [];
  if (days.length) return '每周' + days.map((d) => '一二三四五六日'[d - 1]).join('');
  if (item?.date) {
    const date = dateFromKey(item.date);
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }
  if (item?.yearly) {
    const [m, d] = String(item.yearly).split('-').map(Number);
    return `每年 ${m} 月 ${d} 日`;
  }
  return '每天';
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 24 * 60;
}

/** 「本周剩下还会响的」：今天 18:00 之后 → 本周日 23:59；按首次命中日、再按时间排（§7）。 */
function upcomingReminders(items, { now, weekEnd }) {
  const list = (Array.isArray(items) ? items : []).filter((it) => it && typeof it === 'object' && it.enabled !== false);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const limit = weekEnd || keyOf(start);
  const rows = [];
  for (const item of list) {
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = keyOf(day);
      if (key > limit) break;
      if (!isScheduledToday(item, day)) continue;
      const minutes = minutesOf(item.time);
      if (i === 0 && minutes < 18 * 60) continue; // 今天只算 18:00 之后
      rows.push({ item, dayIndex: i, minutes });
      break;
    }
  }
  rows.sort((a, b) => a.dayIndex - b.dayIndex || a.minutes - b.minutes);
  return rows;
}

function reminderLine(row) {
  const label = fitWidth(row.item.label ?? '', SIZE.label, 380);
  return `${String(row.item.time ?? '').trim()} ${scheduleLabel(row.item)} · ${label}`;
}

/** 导语：按序取第一条「条件成立且能排进 2 行」的，字面量照 §5 给死，不改词不缩字号。 */
function guideCandidateLines({ scored, totalEntries, average, minMood, spread, rainDays }) {
  const lines = [];
  if (!scored.length) lines.push('这周没写，也没关系。');
  if (minMood) lines.push(`${minMood.weekday} 那天不太好，其他几天还行。`);
  if (spread != null && spread >= 8) lines.push(`这周温差 ${Math.round(spread)}°，早晚差得多。`);
  if (rainDays >= 3) lines.push(`这周有 ${rainDays} 天要打伞。`);
  if (scored.length) lines.push(`这周记了 ${totalEntries} 次，平均 ${scoreText(average)} 分。`);
  lines.push('这是你的一周。');
  return lines;
}

// 中文行首/行尾禁则：别把「，。」丢到行首，也别把「「（」留在行尾
const NO_LINE_START = '，。、；：！？）」』】…·%°';
const NO_LINE_END = '「（“‘《【';
const canBreakAt = (chars, index) => {
  const prev = chars[index - 1];
  const next = chars[index];
  if (!prev || !next) return false;
  if (NO_LINE_START.includes(next)) return false;
  if (NO_LINE_END.includes(prev)) return false;
  return true;
};

/** 一行装得下就一行；装不下折成两行（§0.2：每行 ≤572，行首行尾守禁则），两行都装不下 → null（换下一条）。 */
function wrapGuide(line, size = SIZE.h3, maxWidth = 572) {
  if (measureCardText(line, size) <= maxWidth) return [line];
  const chars = [...line];
  let best = null;
  let bestPunct = null;   // 断在标点之后优先：中文排版里「…次，/ 平均…」比「…次，平 / 均…」自然
  for (let i = 1; i < chars.length; i += 1) {
    if (!canBreakAt(chars, i)) continue;
    const head = chars.slice(0, i).join('');
    const tail = chars.slice(i).join('');
    const headWidth = measureCardText(head, size);
    const tailWidth = measureCardText(tail, size);
    if (headWidth > maxWidth || tailWidth > maxWidth) continue;
    const balance = Math.abs(headWidth - tailWidth);
    if (!best || balance < best.balance) best = { index: i, balance };
    if ('，。、；：！？'.includes(chars[i - 1]) && (!bestPunct || balance < bestPunct.balance)) {
      bestPunct = { index: i, balance };
    }
  }
  const chosen = bestPunct ?? best;
  if (!chosen) return null;
  best = chosen;
  return [chars.slice(0, best.index).join(''), chars.slice(best.index).join('')];
}

/**
 * @param {object} review buildWeeklyReview() 的输出
 * @param {object} [profile] 偏好（目前只用 nickname，place 已在上游收口）
 * @param {{ now?: Date, theme?: 'dark'|'light', reminders?: Array }} [opts]
 * @returns {string} SVG
 */
export function buildWeeklyCardSvg(review = {}, profile = {}, opts = {}) {
  const now = opts.now ?? new Date();
  const theme = opts.theme === 'light' ? 'light' : 'dark';
  const p = CARD_THEMES[theme];

  const week = review?.week && typeof review.week === 'object' ? review.week : {};
  const dates = Array.isArray(week.dates) ? week.dates : [];
  const columnOf = (key) => (dates.length && key ? dates.indexOf(key) + 1 : 0);

  // 今天 = 第 t 列（1=周一）；review 不是本周的（比如跨了零点）就退回情绪窗末日
  let t = columnOf(keyOf(now));
  if (!t) t = columnOf(review?.mood?.to);
  if (!t) t = 7;
  t = Math.min(7, Math.max(1, t));

  const days = (Array.isArray(review?.weather?.days) ? review.weather.days : [])
    .map((day) => ({ day, col: columnOf(day?.date) }))
    .filter((row) => row.col >= t && row.col <= 7);
  const usable = days
    .filter((row) => num(row.day?.min) != null && num(row.day?.max) != null)
    .map((row) => ({ col: row.col, min: num(row.day.min), max: num(row.day.max), rain: num(row.day.rain) }))
    .sort((a, b) => a.col - b.col);

  const moods = (Array.isArray(review?.mood?.slots) ? review.mood.slots : [])
    .map((slot) => ({ slot, col: columnOf(slot?.date) }))
    .filter((row) => row.col >= 1 && row.col <= t && num(row.slot?.score) != null)
    .map((row) => ({ col: row.col, score: num(row.slot.score), weekday: row.slot.weekday ?? WEEKDAYS[row.col - 1] }))
    .sort((a, b) => a.col - b.col);
  const scored = (Array.isArray(review?.mood?.slots) ? review.mood.slots : []).filter((s) => num(s?.score) != null);

  const nodes = [];

  // ── 头（28/64 + 44/100）────────────────────────────────────────────
  const place = String(review?.city ?? profile?.city ?? '这里').trim() || '这里';
  const cityShort = fitWidth(place, SIZE.label, 14 * SIZE.label); // 14 全角当量
  nodes.push(text(48, HEAD_WEEK_Y, `第 ${week.number ?? 1} 周 · ${cityShort}`, { size: SIZE.label, fill: p.ink2 }));
  nodes.push(text(48, HEAD_RANGE_Y, formatRange(week.start ?? keyOf(now), week.end ?? keyOf(now)), { size: SIZE.h3, fill: p.ink, weight: 600 }));

  // ── 导语（4px warm 竖线 + 44/600，§5）──────────────────────────────
  const minMoodSlot = scored.length
    ? scored.reduce((best, slot) => (num(slot.score) <= num(best.score) ? slot : best))
    : null;
  const lo = usable.length ? Math.min(...usable.map((d) => d.min)) : null;
  const hi = usable.length ? Math.max(...usable.map((d) => d.max)) : null;
  const rainDays = days.filter((row) => num(row.day?.rain) != null && Number(row.day.rain) >= 40).length;
  const candidates = guideCandidateLines({
    scored,
    totalEntries: review?.mood?.totalEntries ?? scored.length,
    average: review?.mood?.average,
    minMood: minMoodSlot && num(minMoodSlot.score) <= 2
      ? { weekday: minMoodSlot.weekday ?? WEEKDAYS[columnOf(minMoodSlot.date) - 1] }
      : null,
    spread: lo != null && hi != null ? hi - lo : null,
    rainDays,
  });
  let guideLines = ['这是你的一周。'];
  for (const line of candidates) {
    const wrapped = wrapGuide(line);
    if (wrapped) { guideLines = wrapped; break; }
  }
  nodes.push('<line x1="' + GUIDE_BAR.x + '" y1="' + GUIDE_BAR.top + '" x2="' + GUIDE_BAR.x + '" y2="' + GUIDE_BAR.bottom
    + '" stroke="' + p.warm + '" stroke-width="' + GUIDE_BAR.width + '" stroke-linecap="round"/>');
  guideLines.forEach((line, index) => {
    nodes.push(text(GUIDE_X, GUIDE_Y[index] ?? GUIDE_Y[1], line, { size: SIZE.h3, fill: p.ink, weight: 600 }));
  });

  // ── 温度带（今天 → 周日）──────────────────────────────────────────
  if (!usable.length) {
    // §8.5 预报完全缺失
    nodes.push(text(48, TEMP_MID, '没有拿到这周的预报', { size: SIZE.label, fill: p.ink2 }));
  } else if (usable.length <= 3) {
    // §8.4 可用列 ≤3：退化成区间条（8px 胶囊，cool→warm），不画 7 列、不画日标
    nodes.push('<line x1="48" y1="' + TEMP_MID + '" x2="672" y2="' + TEMP_MID + '" stroke="' + p.rule + '" stroke-width="8" stroke-linecap="round"/>');
    nodes.push('<line x1="48" y1="' + TEMP_MID + '" x2="672" y2="' + TEMP_MID + '" stroke="url(#' + theme + '-week-range)" stroke-width="8" stroke-linecap="round"/>');
    nodes.push(text(48, TEMP_LABEL_Y, Math.round(lo) + '°', { size: SIZE.label, fill: p.ink2 }));
    nodes.push(text(672, TEMP_LABEL_Y, Math.round(hi) + '°', { size: SIZE.label, fill: p.ink2, anchor: 'end' }));
  } else {
    const domainLow = lo - 2;   // ±2 对称 padding：两线中点在 y=380（§3）
    const domainHigh = hi + 2;
    const yTemp = (value) => TEMP_TOP + ((domainHigh - value) / (domainHigh - domainLow)) * (TEMP_BOTTOM - TEMP_TOP);
    nodes.push('<line x1="48" y1="' + TEMP_MID + '" x2="672" y2="' + TEMP_MID + '" stroke="' + p.rule + '" stroke-width="1"/>');

    // 连续列成段：段内连折线，段间断开（缺数据不插值）
    const runs = [];
    let current = [];
    usable.forEach((day, index) => {
      if (index > 0 && day.col !== usable[index - 1].col + 1) { runs.push(current); current = []; }
      current.push(day);
    });
    if (current.length) runs.push(current);

    const sameTemp = usable.every((day) => day.min === day.max) && usable.every((day) => day.max === usable[0].max);
    for (const run of runs) {
      const points = run.map((day) => ({ x: WEEK_COLUMNS[day.col - 1], high: yTemp(day.max), low: yTemp(day.min) }));
      if (points.length > 1) {
        if (!sameTemp) {
          const fill = 'M' + points.map((row) => row.x.toFixed(1) + ',' + row.high.toFixed(1)).join(' L')
            + ' L' + points.slice().reverse().map((row) => row.x.toFixed(1) + ',' + row.low.toFixed(1)).join(' L') + ' Z';
          nodes.push('<path d="' + fill + '" fill="' + p.ink + '" fill-opacity="0.08"/>');
          nodes.push('<polyline points="' + points.map((row) => row.x.toFixed(1) + ',' + row.low.toFixed(1)).join(' ')
            + '" fill="none" stroke="' + p.cool + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
        }
        nodes.push('<polyline points="' + points.map((row) => row.x.toFixed(1) + ',' + row.high.toFixed(1)).join(' ')
          + '" fill="none" stroke="' + p.warm + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>');
      }
      run.forEach((day, index) => {
        const row = points[index];
        const r = day.col === t ? 4.5 : 3;   // 9px / 6px
        nodes.push('<circle cx="' + row.x.toFixed(1) + '" cy="' + row.high.toFixed(1) + '" r="' + r + '" fill="' + p.warm + '"/>');
        if (!sameTemp) {
          nodes.push('<circle cx="' + row.x.toFixed(1) + '" cy="' + row.low.toFixed(1) + '" r="' + r + '" fill="' + p.cool + '"/>');
        }
      });
    }

    // 雨标：日标下方 3 条短线（500 → 504.5），只标有雨的天
    for (const row of days) {
      const rain = num(row.day?.rain);
      if (rain == null || rain < 40) continue;
      const cx = WEEK_COLUMNS[row.col - 1];
      for (const startX of [cx - 8, cx - 2, cx + 4]) {
        nodes.push('<line x1="' + startX.toFixed(1) + '" y1="' + RAIN_TOP + '" x2="' + (startX - 2.5).toFixed(1)
          + '" y2="' + (RAIN_TOP + RAIN_DY) + '" stroke="' + p.cool + '" stroke-width="2" stroke-linecap="round"/>');
      }
    }

    for (let col = 1; col <= 7; col += 1) {
      nodes.push(text(WEEK_COLUMNS[col - 1], TEMP_LABEL_Y, col === t ? '今天' : WEEKDAYS[col - 1],
        { size: SIZE.label, fill: p.ink2, anchor: 'middle' }));
    }
  }

  // ── 情绪线（周一 → 今天）──────────────────────────────────────────
  nodes.push('<line x1="48" y1="' + MOOD_MID + '" x2="672" y2="' + MOOD_MID + '" stroke="' + p.rule + '" stroke-width="1" stroke-dasharray="4 8"/>');
  if (!scored.length) {
    // §8.2 整周没有记录：只留虚线和一行字，不画轨道、不画空心圈
    nodes.push(text(48, 588, '这周还没有记录', { size: SIZE.label, fill: p.ink2 }));
  } else {
    const yMood = (avg) => MOOD_BOTTOM - ((avg - 1) / 4) * (MOOD_BOTTOM - MOOD_TOP);
    const byCol = new Map(moods.map((row) => [row.col, row]));
    for (let col = 1; col <= t; col += 1) {
      const hit = byCol.get(col);
      const x = WEEK_COLUMNS[col - 1];
      if (hit) {
        nodes.push('<circle cx="' + x.toFixed(1) + '" cy="' + yMood(hit.score).toFixed(1) + '" r="6" fill="' + p.cool + '"/>');
      } else {
        nodes.push('<circle cx="' + x.toFixed(1) + '" cy="' + MOOD_MID + '" r="6" fill="none" stroke="' + p.ink2
          + '" stroke-opacity="0.4" stroke-width="1"/>');
      }
    }
    // 相邻两列都有记录才连线（缺日断开，不插值）
    for (let col = 1; col < t; col += 1) {
      const a = byCol.get(col);
      const b = byCol.get(col + 1);
      if (!a || !b) continue;
      nodes.push('<line x1="' + WEEK_COLUMNS[col - 1].toFixed(1) + '" y1="' + yMood(a.score).toFixed(1)
        + '" x2="' + WEEK_COLUMNS[col].toFixed(1) + '" y2="' + yMood(b.score).toFixed(1)
        + '" stroke="' + p.cool + '" stroke-width="3" stroke-linecap="round"/>');
    }
  }
  for (let col = 1; col <= 7; col += 1) {
    nodes.push(text(WEEK_COLUMNS[col - 1], MOOD_LABEL_Y, col === t ? '今天' : WEEKDAYS[col - 1],
      { size: SIZE.label, fill: p.ink2, anchor: 'middle' }));
  }

  // ── 事实带（最暖 / 最低 / 本周 Token，§6 + §10）────────────────────
  const cells = [];
  const warmDays = (Array.isArray(review?.weather?.days) ? review.weather.days : []).filter((d) => num(d?.max) != null);
  if (warmDays.length) {
    const warm = warmDays.reduce((best, day) => (num(day.max) > num(best.max) ? day : best));
    cells.push({ label: '最暖', value: (warm.weekday ?? mdOf(warm.date)) + ' ' + Math.round(num(warm.max)) + '°' });
  }
  if (scored.length) {
    const low = scored.reduce((best, slot) => (num(slot.score) <= num(best.score) ? slot : best));
    cells.push({ label: '情绪最低', value: (low.weekday ?? '') + ' ' + scoreText(low.score) });
  }
  const tokenText = review?.usage ? formatTokens(review.usage.tokens) : null;
  if (tokenText != null) cells.push({ label: '本周 Token', value: tokenText });
  const xs = cells.length === 3 ? FACT_X3 : cells.length === 2 ? FACT_X2 : [48];
  cells.forEach((cell, index) => {
    const x = xs[index];
    nodes.push(text(x, FACT_LABEL_Y, cell.label, { size: SIZE.label, fill: p.ink2 }));
    nodes.push(text(x, FACT_VALUE_Y, fitWidth(cell.value, SIZE.h3, FACT_MAX_WIDTH), { size: SIZE.h3, fill: p.ink, weight: 600 }));
  });

  // ── 提醒（≤2 行，§7）──────────────────────────────────────────────
  const rows = upcomingReminders(opts.reminders, { now, weekEnd: week.end });
  const reminderLines = rows.slice(0, 2).map(reminderLine);
  if (rows.length > 2) reminderLines[1] += ' +' + (rows.length - 2);
  reminderLines.forEach((line, index) => {
    const y = REMINDER_Y[index];
    nodes.push('<circle cx="48" cy="' + (y - 10) + '" r="4" fill="' + p.warm + '"/>');
    nodes.push(text(68, y, fitWidth(line, SIZE.label, 604), { size: SIZE.label, fill: p.ink2 }));
  });

  // ── 脚 ────────────────────────────────────────────────────────────
  nodes.push(text(48, FOOTER_Y, CARD_BRAND + ' · ' + fitWidth(place, SIZE.label, 24 * SIZE.label),
    { size: SIZE.label, fill: p.ink2 }));

  // ── 皮肤：顶坡 + 收口（§1 质感；周卡没有数据带 → 不画台阶）────────────────
  const { bgGradient, rims } = buildCardSkin({ theme, palette: p, tone: null });
  const rangeGradient = usable.length > 0 && usable.length <= 3
    ? '<linearGradient id="' + theme + '-week-range" gradientUnits="userSpaceOnUse" x1="48" y1="0" x2="672" y2="0">'
      + '<stop offset="0" stop-color="' + p.cool + '"/><stop offset="1" stop-color="' + p.warm + '"/></linearGradient>'
    : '';

  // 背景用 path 不用 rect：§9-5 要求「fill ≠ none 的 <rect> = 0」，全卡一个矩形都不留。
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + 720 + '" height="' + 980 + '" viewBox="0 0 720 980"'
    + ' font-family="' + CARD_FONT.replace(/"/g, '&quot;') + '">'
    + '<defs>' + bgGradient + rangeGradient + '</defs>'
    + '<path d="M0 0H720V980H0Z" fill="url(#' + theme + '-bg)"/>'
    + nodes.join('')
    + rims
    + '</svg>';
}
