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

async function geocode(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`地理编码 HTTP ${res.status}`);
  const json = await res.json();
  const hit = json?.results?.[0];
  if (!hit) throw new Error(`找不到城市「${city}」`);
  return hit;
}

async function fetchAir(lat, lon) {
  try {
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10&timezone=auto`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current ?? {};
    return { aqi: cur.european_aqi ?? null, pm25: cur.pm2_5 ?? null };
  } catch { return null; }
}

export async function fetchOpenMeteo(city, { days = 3 } = {}) {
  const place = String(city ?? '').trim();
  if (!place) throw new Error('城市不能为空');
  const dayCount = Math.min(3, Math.max(1, Number(days) || 3));

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
    hourlyPoints.push({ stamp: String(t), hour: h });
  }

  const daysOut = [];
  for (let i = 0; i < dayCountActual; i += 1) {
    const date = String(daily.time[i]);
    const hours = {};
    for (const h of wantHours) {
      const idx = hourlyPoints.findIndex((p) => p.stamp.startsWith(date) && p.hour === h);
      hours[`h${h}`] = idx >= 0 ? num(hourly.temperature_2m[idx]) : null;
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
    });
  }

  const air = await fetchAir(lat, lon);

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
