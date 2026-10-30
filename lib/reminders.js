// 统一的提醒引擎：文本提醒和天气条件提醒共用同一套时间、状态与投递。
//
// 一个提醒 = 时间 + 触发条件 + 内容：
//   · intent=text    无条件，到点就说（吃药、喝水、站起来走走）；
//   · intent=weather 到点先看天气，条件命中才说（降雨、降温、大风、温差、空气质量）。
// 天气条件在"到点那一刻"用最新预报评估，所以提前一晚设的提醒不会因为预报变了而说错话。
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

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
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

export function sanitizeReminder(input = {}) {
  const label = String(input.label ?? input.text ?? '').trim().slice(0, 80);
  const time = String(input.time ?? '').trim();
  if (!label) throw new Error('提醒内容（label）不能为空');
  if (minutesOf(time) == null) throw new Error('时间格式必须是 HH:MM');
  const intent = input.intent === 'weather' ? 'weather' : 'text';
  const out = {
    id: String(input.id ?? '').trim() || `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    label,
    time,
    intent,
    days: Array.isArray(input.days) && input.days.length
      ? [...new Set(input.days.map(Number).filter((d) => d >= 1 && d <= 7))].sort()
      : null,
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

/** 到点且今天还没发过的提醒（允许 2 小时补发窗口） */
export function dueReminders(items, now = new Date(), { graceMinutes = 120 } = {}) {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayKey(now);
  const weekday = now.getDay() === 0 ? 7 : now.getDay();
  return (Array.isArray(items) ? items : []).filter((it) => {
    if (!it || it.enabled === false) return false;
    if (it.days && !it.days.includes(weekday)) return false;
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

export function describeReminder(item = {}) {
  const time = item.time ?? '--:--';
  const label = item.label ?? '提醒';
  const daysText = Array.isArray(item.days) && item.days.length ? `周${item.days.join('/')}` : '每天';
  if (item.intent === 'weather') {
    const meta = WEATHER_TYPES[item.weather?.type];
    return `${time} ${daysText} · 天气(${meta?.label ?? item.weather?.type ?? '?'}≥${item.weather?.threshold ?? '?'}) · ${label}`;
  }
  return `${time} ${daysText} · ${label}`;
}
