// 周卡数据层：把「本周天气 + 一周情绪 + 用量」压成一个纯数据对象，给周卡渲染层吃。
//
// 只做数据：不取数、不渲染、不写文件；每个入参都可缺，缺就给 null，绝不抛错。
//   buildWeeklyReview({ data, moods, profile, usage, now })
//     → { city, cityShort, nickname, week, air, weather, mood, usage }
//   提醒不进这里：卡片要的「今天 18:00 → 本周日」两行由渲染层拿原始数组自己展开（见 card-week.js）。
//
// 取数（联网 / 读文件）不在这里：天气由 providers 取，情绪由 mood.js 读，
// token 用量由 usage.js 的 loadWeeklyUsage() 读，渲染层把结果原样传进来即可。
//
// 三条口径（和既有模块对齐，别各写一套）：
//   · 周区间固定按本地时间「周一~周日」，第几周按 ISO 8601（跨年周按 ISO 年算）；
//   · 情绪「一天多条取均值」：直接复用 mood.js 的 moodTrend —— 和 mood 工具回看时
//     看到的分数是同一个数；取最后一条会让同一天在周卡和 mood 工具里显示不同分数，
//     也会把「下午崩、晚上缓过来」这种波动抹成一个数，都不如均值诚实；
//   · 日期键一律本地 'YYYY-MM-DD'，和 mood.js / reminders.js 的 date 字段同构。
//
// 降级策略：少几天就给几天槽（不补空占位），只有 3 天预报时所有极值都在这 3 天里算；
// 拿不到的东西一律 null（不是 0，也不是抛错），渲染层按「有没有」决定藏还是显示。

import { moodTrend, todayKey } from './mood.js';
import { aqiLabel } from './weather.js';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MAX_WEATHER_DAYS = 7;
const CITY_MAX = 12; // cityShort 的字数上限（渲染层统一按这个截，别各写一套）

const pad2 = (n) => String(n).padStart(2, '0');
const round1 = (n) => Math.round(n * 10) / 10;
const mdOf = (key) => String(key).slice(5);

/** 缺数据给 null（不是 0）；0°C / 0% 这类真实零值照常保留。 */
function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 'YYYY-MM-DD' → 本地 Date（别用 new Date(key)，那是 UTC 解析，会差一天）。 */
function dateFromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekdayName(key) {
  return WEEKDAYS[(dateFromKey(key).getDay() || 7) - 1];
}

/** ISO 8601 周编号：本周四落在哪一年，这周就算哪一年的第几周。 */
export function isoWeekOf(now = new Date()) {
  const probe = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekday = probe.getUTCDay() || 7;
  probe.setUTCDate(probe.getUTCDate() + 4 - weekday);
  const year = probe.getUTCFullYear();
  const weekNumber = Math.ceil(((probe.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, weekNumber };
}

/** 周区间：本地周一~周日 + ISO 周编号 + 7 个日期键。 */
export function weekWindow(now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = day.getDay() || 7; // 1=周一 … 7=周日
  const monday = new Date(day);
  monday.setDate(day.getDate() - (weekday - 1));
  const dates = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(todayKey(d));
  }
  const iso = isoWeekOf(now);
  return {
    start: dates[0],
    end: dates[6],
    number: iso.weekNumber,
    year: iso.year,
    label: `${mdOf(dates[0])} ~ ${mdOf(dates[6])}`,
    dates,
  };
}

// 天气 provider 的 day.date 只有 'MM-DD'（见 weather.js / openmeteo.js），没有年份。
// 预报只会覆盖「今天起 7 天」，而今天必然落在本周内，所以本周的 md 一定落在
// [周一, 周日 + 6] 这 13 天里 —— 用这 13 天反查 md → 完整日期，绕开跨年周的年份猜谜。
function mdIndex(week) {
  const map = new Map();
  const first = dateFromKey(week.start);
  for (let i = 0; i < 13; i += 1) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const key = todayKey(d);
    map.set(mdOf(key), key);
  }
  return map;
}

function dayKeyOf(raw, index) {
  const text = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text; // 已经是完整日期就信它
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(text);
  if (!m) return null;
  return index.get(`${pad2(Number(m[1]))}-${pad2(Number(m[2]))}`) ?? null;
}

function buildAir(data) {
  const air = data?.air;
  if (!air || typeof air !== 'object') return null;
  const aqi = numOrNull(air.aqi);
  const meta = aqi == null ? null : aqiLabel(aqi);
  return { aqi, pm25: numOrNull(air.pm25), level: meta?.level ?? null, advice: meta?.advice ?? null };
}

// 每天的 AQI：provider 若直接给了 day.aqi 就用自己的；否则用 air.dailyAqi
// （open-meteo 的 hourly european_aqi 按天取最大，见 dailyAqiFromHourly）。
function aqiOf(day, key, dailyAqi) {
  const own = numOrNull(day?.aqi);
  if (own != null) return own;
  if (!dailyAqi || typeof dailyAqi !== 'object') return null;
  return numOrNull(dailyAqi[key]);
}

/** 天气块：本周内的日槽（按日期升序）+ 周内缺口 + 四个极值。 */
function buildWeather(data, week) {
  const raw = Array.isArray(data?.days) ? data.days.slice(0, MAX_WEATHER_DAYS) : [];
  const dailyAqi = data?.air?.dailyAqi && typeof data.air.dailyAqi === 'object' ? data.air.dailyAqi : null;
  const index = mdIndex(week);
  const weekSet = new Set(week.dates);
  const seen = new Set();
  const days = [];
  let skipped = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') { skipped += 1; continue; }
    const key = dayKeyOf(item.date, index);
    if (!key || seen.has(key)) { skipped += 1; continue; } // 没有日期就没法挂在周上
    // 邻窗截断：预报会伸到下周（周日生成时 7 天里只有 1 天在本周），
    // 超过本周日的日子一律丢掉 —— 否则「最暖」会取到下周那个根本不在这张卡上的周六。
    if (key > week.end) { skipped += 1; continue; }
    seen.add(key);
    const min = numOrNull(item.min);
    const max = numOrNull(item.max);
    days.push({
      date: key,
      md: mdOf(key),
      weekday: weekdayName(key),
      min,
      max,
      desc: String(item.desc ?? '').trim() || null,
      rain: numOrNull(item.rain),
      aqi: aqiOf(item, key, dailyAqi),
      swing: min != null && max != null ? round1(max - min) : null,
      inWeek: weekSet.has(key),
    });
    // 说明：key 已保证在 [week.start, week.end] 内，inWeek 恒为 true；
    // 保留这个字段是因为渲染侧仍按它判断（万一有人塞进外来的 days）。
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const covered = new Set(days.filter((d) => d.inWeek).map((d) => d.date));
  return {
    count: days.length,
    skipped,
    weekDays: covered.size,
    missingDates: week.dates.filter((key) => !covered.has(key)),
    days,
    extremes: extremesOf(days),
  };
}

/** 四个极值：温度最高 / 最低 / 温差最大 / 空气最差；同值取最早那天。 */
function extremesOf(days) {
  let hottest = null;
  let coldest = null;
  let biggestSwing = null;
  let worstAir = null;
  const pick = (day, value) => ({
    date: day.date, md: day.md, weekday: day.weekday, value, desc: day.desc,
  });
  for (const day of days) {
    if (day.max != null && (!hottest || day.max > hottest.value)) hottest = pick(day, day.max);
    if (day.min != null && (!coldest || day.min < coldest.value)) coldest = pick(day, day.min);
    if (day.swing != null && (!biggestSwing || day.swing > biggestSwing.value)) biggestSwing = pick(day, day.swing);
    if (day.aqi != null && (!worstAir || day.aqi > worstAir.value)) worstAir = pick(day, day.aqi);
  }
  return { hottest, coldest, biggestSwing, worstAir };
}

/** 情绪块：固定 7 个日槽（周一~周日）+ 记录天数 / 平均分 / 最低那天。 */
function buildMood(moods, week, now) {
  const list = (Array.isArray(moods) ? moods : [])
    .filter((e) => e && typeof e.date === 'string' && Number.isFinite(Number(e.score)))
    .map((e) => ({ ...e, score: Number(e.score), at: Number(e.at) || 0 }));

  // 复用 moodTrend：窗口取「本周一 ~ 今天」（今天之后的槽位本来也没记录）。
  const offset = Math.max(0, week.dates.indexOf(todayKey(now)));
  const trend = moodTrend(list, { days: offset + 1, now });
  const byDate = new Map(trend.map((d) => [d.date, d]));

  const notes = new Map();
  for (const entry of list) {
    if (!entry.note || !week.dates.includes(entry.date)) continue;
    const prev = notes.get(entry.date);
    if (!prev || entry.at >= prev.at) notes.set(entry.date, { at: entry.at, note: String(entry.note) });
  }

  const slots = week.dates.map((key, i) => {
    const hit = byDate.get(key);
    return {
      date: key,
      md: mdOf(key),
      weekday: WEEKDAYS[i],
      score: hit ? hit.avg : null,
      count: hit ? hit.count : 0,
      note: notes.get(key)?.note ?? null,
    };
  });

  const filled = slots.filter((s) => s.score != null);
  // 均分按「条数加权」求和，和 mood.js 的 moodSummary 同一算法，两处数字不会对不上。
  const entries = slots.reduce((sum, s) => sum + (s.score ?? 0) * s.count, 0);
  const totalCount = slots.reduce((sum, s) => sum + s.count, 0);
  const lowest = filled.length
    ? filled.reduce((best, s) => (s.score < best.score ? s : best))
    : null;

  return {
    slots,
    from: week.start,          // 窗口 = 本周一 ~ 今天（周一开始，和 moodTrend 的窗口一致）
    to: todayKey(now),
    recordedDays: filled.length,
    totalEntries: totalCount,
    average: totalCount ? round1(entries / totalCount) : null,
    lowest: lowest ? { date: lowest.date, md: lowest.md, weekday: lowest.weekday, score: lowest.score } : null,
  };
}

// 提醒不在这里聚合：周卡要的是「今天 18:00 → 本周日」那两行，
// 直接由渲染层（lib/card-week.js）拿原始 reminders 用 isScheduledToday 逐日展开 ——
// 同一件事只留一套口径，别让数据层再算一遍「这周设过的 / 下周将发生的」。

// 用量块：原样收口成固定 6 个键（缺的给 null），不在这里做任何取整/换算。
function usageBlock(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const pick = (value) => (value === undefined ? null : value);
  return {
    tokens: pick(usage.tokens),
    cost: pick(usage.cost),
    turns: pick(usage.turns),
    from: pick(usage.from),
    to: pick(usage.to),
    source: pick(usage.source),
  };
}

/**
 * 周卡数据总入口。
 * @param {{ data?: object, moods?: Array, profile?: object,
 *           usage?: object|null, now?: Date }} [input]
 *   data      fetchWeather 的结果（weather.js / openmeteo.js 的契约，可残缺）
 *   moods     loadMoods 的结果（{ date, score, note, at }[]）
 *   profile   档案（只用 nickname / city）
 *   usage     loadWeeklyUsage() 的结果（{ tokens, cost, turns, from, to, source } | null）
 */
export function buildWeeklyReview({ data = {}, moods = [], profile = {}, usage = null, now = new Date() } = {}) {
  const week = weekWindow(now);
  const rawCity = String(data?.place ?? data?.city ?? profile?.city ?? '').trim();
  const city = rawCity ? rawCity.slice(0, 120) : null;
  const chars = city ? [...city] : [];
  return {
    generatedAt: Date.now(),
    city,
    // 城市名可能带国名（「城市（国家）」）或不带；渲染层按字数排版容易各写一套，
    // 统一在数据层给一个 ≤12 字的短名，city 保留原名给日志 / 无障碍文案。
    cityShort: city ? (chars.length > CITY_MAX ? `${chars.slice(0, CITY_MAX - 1).join('')}…` : city) : null,
    nickname: String(profile?.nickname ?? '').trim().slice(0, 40) || null,
    week,
    air: buildAir(data),
    weather: buildWeather(data, week),
    mood: buildMood(moods, week, now),
    // 本周 token 用量：传 loadWeeklyUsage() 的返回（或 null），这里只做形状收口
    usage: usageBlock(usage),
  };
}
