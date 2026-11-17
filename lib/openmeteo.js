// Open-Meteo 数据源：不依赖 wttr.in，适合 wttr 被墙/不稳定时切换。
// 接口形状与 wttr provider 完全一致（见 ./index.js 的契约），上层无需改动。
//
// 用到两个免费接口：
//   · geocoding-api.open-meteo.com   城市 → 经纬度
//   · api.open-meteo.com             预报 + 当前天气
//   · air-quality-api.open-meteo.com 空气质量

import { num } from './weather.js';

// WMO weather code → 中文（open-meteo 用 WMO 码，和 wttr 的 WWO 文本不同）
export const WMO_ZH = {
  0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
  45: '雾', 48: '冻雾',
  51: '毛毛雨', 53: '小雨', 55: '中雨',
  56: '冻毛毛雨', 57: '冻雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '小阵雨', 81: '中阵雨', 82: '强阵雨',
  85: '小阵雪', 86: '大阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴伴冰雹',
};

export function wmoZh(code) {
  const n = Number(code);
  return WMO_ZH[n] ?? `天气码 ${code}`;
}

// Open-Meteo 最多 16 天；周卡要 7 天，这里放开到 1~7（默认仍是 3，每日卡只用前三天）。
const MAX_FORECAST_DAYS = 7;

/** 预报天数兜底：1~7 取整；缺省/非法仍按 3（和旧行为一致）。 */
export function clampDays(days, fallback = 3) {
  const n = Number(days);
  const want = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return Math.min(MAX_FORECAST_DAYS, Math.max(1, want));
}

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`地理编码 HTTP ${res.status}`);
  const json = await res.json();
  const hit = json?.results?.[0];
  if (!hit) throw new Error(`找不到城市「${city}」`);
  return hit;
}

// 空气接口只给「当前」值，周卡要「哪天空气最差」只能自己按天取最大：
// hourly=european_aqi 一天 24 个点，timezone=auto 的 timestamp 前 10 位就是本地日期。
/** @returns {Record<string, number>} { 'YYYY-MM-DD': 当天最大 AQI } */
export function dailyAqiFromHourly(hourly) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const values = Array.isArray(hourly?.european_aqi) ? hourly.european_aqi : [];
  /** @type {Record<string, number>} */
  const out = {};
  for (let i = 0; i < times.length; i += 1) {
    const day = String(times[i] ?? '').slice(0, 10);
    const raw = values[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(value)) continue;
    if (!(day in out) || value > out[day]) out[day] = value;
  }
  return out;
}

async function fetchAir(lat, lon, days = 3) {
  try {
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10&hourly=european_aqi&forecast_days=${clampDays(days)}&timezone=auto`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current ?? {};
    const dailyAqi = dailyAqiFromHourly(json?.hourly);
    return { aqi: cur.european_aqi ?? null, pm25: cur.pm2_5 ?? null, dailyAqi };
  } catch { return null; }
}

export async function fetchOpenMeteo(city, { days = 3 } = {}) {
  const place = String(city ?? '').trim();
  if (!place) throw new Error('城市不能为空');
  const dayCount = clampDays(days);

  const geo = await geocode(place);
  const { latitude: lat, longitude: lon } = geo;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    forecast_days: String(dayCount),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,uv_index',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const daily = json?.daily;
  const hourly = json?.hourly;
  const cur = json?.current;
  if (!daily?.time?.length || !cur) throw new Error('Open-Meteo 返回数据不完整');

  const labels = ['今天', '明天', '后天'];
  const dayCountActual = Math.min(dayCount, daily.time.length);

  // 按日期索引 hourly，取 9/12/15/18/21 点温度
  const wantHours = [9, 12, 15, 18, 21];
  const hourlyPoints = [];
  for (const t of hourly?.time ?? []) {
    const [, time] = String(t).split('T');
    const h = Number(String(time ?? '').slice(0, 2));
    // idx 记住它在 hourly.temperature_2m / precipitation_probability 里的位置，
    // 后面逐小时降雨直接用同一下标取，避免再按 stamp 二次查找。
    hourlyPoints.push({ stamp: String(t), hour: h, idx: hourlyPoints.length });
  }

  const daysOut = [];
  for (let i = 0; i < dayCountActual; i += 1) {
    const date = String(daily.time[i]);
    const hours = {};
    for (const h of wantHours) {
      const idx = hourlyPoints.findIndex((p) => p.stamp.startsWith(date) && p.hour === h);
      hours[`h${h}`] = idx >= 0 ? num(hourly.temperature_2m[idx]) : null;
    }
    // 逐小时降雨概率：给 care.js 找"今天几点最可能下雨"
    const rainHours = [];
    for (const p of hourlyPoints) {
      if (!p.stamp.startsWith(date)) continue;
      rainHours.push({ hour: p.hour, prob: num(hourly.precipitation_probability?.[p.idx]) });
    }
    daysOut.push({
      label: labels[i] ?? date.slice(5),
      date: date.slice(5),
      min: num(daily.temperature_2m_min[i]),
      max: num(daily.temperature_2m_max[i]),
      desc: wmoZh(daily.weather_code[i]),
      rain: num(daily.precipitation_probability_max[i]),
      wind: num(daily.wind_speed_10m_max[i]),
      precip: num(daily.precipitation_sum[i]),
      hours,
      rainHours,
    });
  }

  const air = await fetchAir(lat, lon, dayCount);

  return {
    place: `${geo.name ?? place}${geo.country ? `（${geo.country}）` : ''}`,
    now: {
      temp: num(cur.temperature_2m),
      feels: num(cur.apparent_temperature),
      desc: wmoZh(cur.weather_code),
      humidity: num(cur.relative_humidity_2m),
      wind: num(cur.wind_speed_10m),
      visibility: 0,
      uv: num(cur.uv_index),
    },
    air,
    days: daysOut,
    provider: 'openmeteo',
    fetchedAt: Date.now(),
  };
}
