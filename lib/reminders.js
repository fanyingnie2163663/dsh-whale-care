// 统一的提醒引擎：文本提醒和天气条件提醒共用同一套时间、状态与投递。
//
// 一个提醒 = 时间 + 触发条件 + 内容：
//   · intent=text    无条件，到点就说（吃药、喝水、站起来走走）；
//   · intent=weather 到点先看天气，条件命中才说（降雨、降温、大风、温差、空气质量）。
// 天气条件在"到点那一刻"用最新预报评估，所以提前一晚设的提醒不会因为预报变了说错话。
//
// 时间表（四选一，不传 days/date/yearly = 每天）：
//   · days:   [1..7]        每周几（1=周一）
//   · date:   'YYYY-MM-DD'  一次性（2026-11-20 的机票、明天 9 点的会）
//   · yearly: 'MM-DD'       每年（生日、纪念日）
//   · 都不传                 每天
//
// 存储：$DSH_HOME/whale-weather/reminders.json（与 profile.json 同目录，600）。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const WEATHER_TYPES = {
  rain: { label: '降雨', defaults: { threshold: 40 } },
  tempDrop: { label: '降温', defaults: { threshold: 5 } },
  wind: { label: '大风', defaults: { threshold: 30 } },
  swing: { label: '昼夜温差', defaults: { threshold: 10 } },
  aqi: { label: '空气质量', defaults: { threshold: 60 } },
};

export function remindersPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'reminders.json');
}

const pad2 = (n) => String(n).padStart(2, '0');

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 'YYYY-MM-DD' → 'YYYY-MM-DD' | null（校验真实日历日，拒绝 2026-02-30）。 */
export function parseDateKey(value) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/** 'MM-DD' → 'MM-DD' | null（按闰年校验 2-29）。 */
export function parseYearlyKey(value) {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // 2024 是闰年，2-29 合法；其他月份按 2024 校验也成立
  const dt = new Date(2024, mo - 1, d);
  if (dt.getFullYear() !== 2024 || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${pad2(mo)}-${pad2(d)}`;
}

export function sanitizeReminder(input = {}) {
  const label = String(input.label ?? input.text ?? '').trim().slice(0, 80);
  const rawTime = String(input.time ?? '').trim();
  if (!label) throw new Error('提醒内容（label）不能为空');
  const at = minutesOf(rawTime);
  if (at == null) throw new Error('时间格式必须是 HH:MM');
  // 统一成两位小时（7:45 → 07:45），和 careTime 的格式保持一致
  const time = `${pad2(Math.floor(at / 60))}:${pad2(at % 60)}`;
  const intent = input.intent === 'weather' ? 'weather' : 'text';

  // 一次性 / 每年 / 每周几：三种时间表互斥，混着传一律报错，
  // 免得「明天提醒我」被静默存成「每周一」。
  const hasDate = input.date !== undefined && input.date !== null && String(input.date).trim() !== '';
  const hasYearly = input.yearly !== undefined && input.yearly !== null && String(input.yearly).trim() !== '';
  const hasDays = Array.isArray(input.days) && input.days.length > 0;
  if (hasDate && hasYearly) throw new Error('date（一次性）和 yearly（每年）只能二选一');
  if ((hasDate || hasYearly) && hasDays) throw new Error('date/yearly 与 days 不能同时设置');

  const date = hasDate ? parseDateKey(input.date) : null;
  if (hasDate && !date) throw new Error(`date 必须是 YYYY-MM-DD 的真实日期（收到 ${input.date}）`);
  if (date) {
    const today = todayKey();
    if (date < today) throw new Error(`date ${date} 已经过去了；要每天/每周提醒请用 days`);
  }
  const yearly = hasYearly ? parseYearlyKey(input.yearly) : null;
  if (hasYearly && !yearly) throw new Error(`yearly 必须是 MM-DD（收到 ${input.yearly}）`);

  let days = null;
  if (hasDays) {
    days = [...new Set(input.days.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort((a, b) => a - b);
    // 全是非法值时必须报错：早先会静默存成 []，dueReminders 里 [] 永远不命中，提醒就"设了但永不响"
    if (!days.length) throw new Error('days 只能是 1~7（1=周一 … 7=周日）');
  }

  const out = {
    id: String(input.id ?? '').trim() || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label,
    time,
    intent,
    days,
    date,
    yearly,
    target: input.target ? String(input.target).slice(0, 60) : null,
    enabled: input.enabled !== false,
    lastFiredDate: input.lastFiredDate ?? null,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Date.now(),
  };
  if (intent === 'weather') {
    const type = String(input.weather?.type ?? '').trim();
    if (!WEATHER_TYPES[type]) throw new Error(`weather.type 必须是 ${Object.keys(WEATHER_TYPES).join(' / ')}`);
    const threshold = Number(input.weather?.threshold);
    out.weather = {
      type,
      threshold: Number.isFinite(threshold) ? threshold : WEATHER_TYPES[type].defaults.threshold,
    };
  }
  return out;
}

export async function loadReminders() {
  try {
    const raw = await readFile(remindersPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export async function saveReminders(items) {
  const file = remindersPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ items }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return items;
}

export async function addReminder(input) {
  const items = await loadReminders();
  const item = sanitizeReminder(input);
  const idx = items.findIndex((it) => it.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  await saveReminders(items);
  return item;
}

export async function removeReminder(id) {
  const items = await loadReminders();
  const next = items.filter((it) => it.id !== String(id));
  const removed = next.length !== items.length;
  if (removed) await saveReminders(next);
  return removed;
}

/** 这条提醒今天是否"轮到了"（不看具体时刻，只看日期/星期）。 */
export function isScheduledToday(item, now = new Date()) {
  if (!item || item.enabled === false) return false;
  const today = todayKey(now);
  if (item.date) return item.date === today;
  if (item.yearly) return item.yearly === today.slice(5);
  if (Array.isArray(item.days)) {
    if (!item.days.length) return false;
    const weekday = now.getDay() === 0 ? 7 : now.getDay();
    return item.days.map(Number).includes(weekday);
  }
  return true;
}

/** 今天会响的提醒（给每日关心做预告用），按时间排序。 */
export function remindersForDay(items, now = new Date()) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => isScheduledToday(it, now))
    .sort((a, b) => (minutesOf(a.time) ?? 0) - (minutesOf(b.time) ?? 0));
}

/** 到点且今天还没发过的提醒（允许 2 小时补发窗口） */
export function dueReminders(items, now = new Date(), { graceMinutes = 120 } = {}) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayKey(now);
  return (Array.isArray(items) ? items : []).filter((it) => {
    if (!it || it.enabled === false) return false;
    if (!isScheduledToday(it, now)) return false;
    if (it.lastFiredDate === today) return false;
    const at = minutesOf(it.time);
    return at != null && nowMin >= at && nowMin - at <= graceMinutes;
  });
}

/** 用最新天气评估一条天气提醒；返回 { matched, line } */
export function evaluateWeatherReminder(item, data) {
  const type = item.weather?.type;
  const threshold = Number(item.weather?.threshold);
  const today = data?.days?.[0];
  const tomorrow = data?.days?.[1];
  if (!type || !today) return { matched: false, line: '' };
  if (type === 'rain') {
    const rain = Math.max(today.rain ?? 0, tomorrow?.rain ?? 0);
    if (rain >= threshold) {
      const when = (tomorrow?.rain ?? 0) > (today.rain ?? 0) ? '明天' : '今天';
      return { matched: true, line: `${when}降雨概率 ${rain}%，${item.label || '记得带伞'}。` };
    }
  }
  if (type === 'tempDrop' && tomorrow) {
    const drop = today.max - tomorrow.max;
    if (drop >= threshold) {
      return { matched: true, line: `明天最高 ${tomorrow.max}°C，比今天低 ${Math.round(drop)}°C，${item.label || '注意加衣服'}。` };
    }
  }
  if (type === 'wind') {
    const wind = Math.max(today.wind ?? 0, tomorrow?.wind ?? 0);
    if (wind >= threshold) return { matched: true, line: `风力最大 ${wind}km/h，${item.label || '风大，注意防风'}。` };
  }
  if (type === 'swing') {
    const swing = (today.max ?? 0) - (today.min ?? 0);
    if (swing >= threshold) {
      const h = today.hours || {};
      const detail = h.h9 != null && h.h15 != null ? `${h.h9}°C 到 ${h.h15}°C` : `${today.min}~${today.max}°C`;
      return { matched: true, line: `今天温差 ${Math.round(swing)}°C（${detail}），${item.label || '早晚记得加件外套'}。` };
    }
  }
  if (type === 'aqi' && data?.air?.aqi != null) {
    if (data.air.aqi >= threshold) {
      return { matched: true, line: `空气质量 AQI ${data.air.aqi}，${item.label || '记得戴口罩'}。` };
    }
  }
  return { matched: false, line: '' };
}

/** 人话版时间表：一次性 / 每年 / 周几 / 每天。 */
export function scheduleText(item = {}) {
  if (item.date) return `${item.date} 一次`;
  if (item.yearly) return `每年 ${item.yearly}`;
  if (Array.isArray(item.days) && item.days.length) return `周${item.days.join('/')}`;
  return '每天';
}

export function describeReminder(item = {}) {
  const time = item.time ?? '--:--';
  const label = item.label ?? '提醒';
  const when = scheduleText(item);
  if (item.intent === 'weather') {
    const meta = WEATHER_TYPES[item.weather?.type];
    return `${time} ${when} · 天气(${meta?.label ?? item.weather?.type ?? '?'}≥${item.weather?.threshold ?? '?'}) · ${label}`;
  }
  return `${time} ${when} · ${label}`;
}
