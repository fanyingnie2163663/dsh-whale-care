// 天气卡片：把结构化天气渲染成一张 720×980 的 SVG，宿主再用 ffmpeg/librsvg 转 PNG。
//
// 为什么用 SVG 而不是直接画 PNG：
//   · 纯字符串、零依赖、可单测；
//   · 服务器已有 ffmpeg（含 librsvg）和 Noto CJK 字体，一条命令就能转图；
//   · 同一个函数在 Web 端也能直接预览。
//
// 只负责"长什么样"，取数/话术仍归 weather.js / care.js。

import { outfitFor, peakRainHour } from './care.js';
import { festivalOf } from './festivals.js';

const W = 720;
const H = 980;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const fit = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const temp = (value) => (value == null || !Number.isFinite(Number(value)) ? '--' : `${Math.round(Number(value))}°`);

/** 今天最值得说的一条（和 care.js 的优先级保持一致，但只取一条）。 */
function rainAdvice(today, profile) {
  if (!today) return '';
  const peak = peakRainHour(today, 50);
  const umbrella = profile?.hasUmbrella === false ? '你平时老忘带伞，记得塞包里。' : '出门带把伞。';
  if (/雨/.test(String(today.desc ?? '')) || Number(today.rain) >= 40) {
    return `今天有雨（${today.rain ?? 0}%）${peak && peak.prob > (today.rain ?? 0) ? `，${peak.hour} 点前后概率最高 ${peak.prob}%` : ''}，${umbrella}`;
  }
  if (peak) return `${peak.hour} 点前后降雨概率 ${peak.prob}%，${umbrella}`;
  return '';
}

function adviceLines(data, profile) {
  const today = data?.days?.[0];
  const tomorrow = data?.days?.[1];
  const air = data?.air;
  const lines = [];
  if (today && today.max != null && today.min != null) {
    const wear = outfitFor(today.max, profile);
    lines.push(`白天穿${wear.day}，${wear.night}。`);
  }
  const rain = rainAdvice(today, profile);
  if (rain) lines.push(rain);
  if (air?.aqi != null && air.aqi >= 61) lines.push(`空气较差（AQI ${air.aqi}），出门戴口罩。`);
  else if (today && Number(today.wind) >= 30) lines.push(`风有 ${today.wind}km/h，围巾戴上。`);
  else if (tomorrow && today && Number(today.max) - Number(tomorrow.max) >= 5) {
    lines.push(`明天最高 ${tomorrow.max}°C，比今天低 ${Math.round(Number(today.max) - Number(tomorrow.max))}°C。`);
  }
  return lines.slice(0, 3);
}

function chip(x, y, label, value, accent = '#9fd3ff') {
  return `
  <g>
    <rect x="${x}" y="${y}" width="304" height="92" rx="20" fill="#ffffff" opacity="0.07"/>
    <text x="${x + 24}" y="${y + 34}" font-size="20" fill="#8fb3d9">${esc(label)}</text>
    <text x="${x + 24}" y="${y + 72}" font-size="30" font-weight="600" fill="${accent}">${esc(value)}</text>
  </g>`;
}

/**
 * @param {object} data fetchWeather 的结构
 * @param {object} profile 偏好
 * @param {{now?:Date}} opts
 * @returns {string} SVG
 */
export function buildWeatherCardSvg(data = {}, profile = {}, { now = new Date() } = {}) {
  const cur = data?.now && typeof data.now === 'object' ? data.now : {};
  const today = data?.days?.[0] ?? null;
  const tomorrow = data?.days?.[1] ?? null;
  const place = fit(data?.place || profile?.city || '这里', 14);
  const festival = festivalOf(now);
  const dateText = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${WEEKDAYS[now.getDay()]}`;
  const desc = fit(cur.desc || today?.desc || '', 10);
  const feels = cur.feels != null && Number.isFinite(Number(cur.feels)) ? `体感 ${Math.round(Number(cur.feels))}°` : '';
  const humidity = cur.humidity != null ? `湿度 ${cur.humidity}%` : '';
  const air = data?.air?.aqi != null ? String(data.air.aqi) : '';
  const rain = today?.rain != null ? `${today.rain}%` : '';
  const wind = today?.wind != null ? `${today.wind}km/h` : '';
  const range = today && today.min != null && today.max != null ? `${today.min}~${today.max}°C` : '--';
  const swing = today && today.min != null && today.max != null ? `${Math.round(Number(today.max) - Number(today.min))}°C` : '--';
  const tomorrowText = tomorrow
    ? `明天 ${tomorrow.min ?? '--'}~${tomorrow.max ?? '--'}°C ${fit(tomorrow.desc || '', 6)}${tomorrow.rain != null ? ` · 降雨 ${tomorrow.rain}%` : ''}`
    : '';
  const lines = adviceLines(data, profile);
  const nickname = profile?.nickname ? `${profile.nickname}，` : '';
  const greeting = now.getHours() < 11 ? '早上好' : now.getHours() < 18 ? '下午好' : '晚上好';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b1a2e"/>
      <stop offset="0.55" stop-color="#12304d"/>
      <stop offset="1" stop-color="#1b4a70"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#67e8f9"/>
      <stop offset="1" stop-color="#93c5fd"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="650" cy="60" r="200" fill="#38bdf8" opacity="0.12"/>
  <circle cx="80" cy="900" r="240" fill="#818cf8" opacity="0.10"/>

  <text x="48" y="66" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="22" fill="#8fb3d9" letter-spacing="2">小肥鱼 · 天气关心</text>
  <text x="48" y="112" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="26" fill="#cfe6ff">${esc(dateText)}</text>
  ${festival ? `<g><rect x="470" y="82" width="200" height="44" rx="22" fill="#f59e0b" opacity="0.18"/><text x="490" y="111" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="22" fill="#fbbf24">今天是${esc(fit(festival.name, 8))}</text></g>` : ''}

  <text x="48" y="186" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="24" fill="#8fb3d9">${esc(nickname)}${esc(greeting)}</text>
  <text x="48" y="248" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="46" font-weight="700" fill="#ffffff">${esc(place)}</text>

  <text x="44" y="400" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="150" font-weight="700" fill="#ffffff">${temp(cur.temp)}</text>
  <text x="330" y="320" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="38" fill="#e2f2ff">${esc(desc)}</text>
  <text x="332" y="368" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="24" fill="#8fb3d9">${esc([feels, humidity].filter(Boolean).join(' · '))}</text>
  <text x="332" y="410" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="24" fill="#8fb3d9">${esc(range)}</text>

  ${chip(48, 470, '温差', swing)}
  ${chip(368, 470, '降雨', rain || '--')}
  ${chip(48, 578, '风力', wind || '--')}
  ${chip(368, 578, '空气', air || '--')}

  <rect x="40" y="700" width="640" height="170" rx="24" fill="#ffffff" opacity="0.06"/>
  ${lines.map((line, i) => `<text x="68" y="${744 + i * 42}" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="24" fill="#dbeafe">· ${esc(fit(line, 30))}</text>`).join('')}

  <text x="48" y="918" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="24" fill="#9fd3ff">${esc(fit(tomorrowText, 34))}</text>
  <text x="48" y="956" font-family="Noto Sans CJK SC, Noto Sans SC, sans-serif" font-size="18" fill="#6f8fb0">dsh-whale-care · ${esc(fit(place, 14))}</text>
</svg>`;
}

export const CARD_SIZE = { width: W, height: H };
