// 纯逻辑层：不依赖 dsh，可单独 import / 测试 / 复用到别的 agent 框架。
//
// 数据源（均免费、无需 API Key）：
//   · wttr.in                     当前天气 + 未来三天（降雨概率、风速、能见度、UV）
//   · air-quality-api.open-meteo  空气质量（AQI / PM2.5），按 wttr 返回的经纬度查

// wttr.in 的 lang_zh 实测不翻译描述（仍返回英文），这里本地映射 WWO 天气代码。
export const WEATHER_ZH = {
  sunny: '晴', clear: '晴',
  'partly cloudy': '多云', cloudy: '阴', overcast: '阴',
  mist: '薄雾', fog: '雾', 'freezing fog': '冻雾', haze: '霾', 'smoky haze': '霾',
  smoke: '烟霾', sand: '沙尘', dust: '浮尘',
  'patchy rain nearby': '局部有雨', 'patchy rain possible': '局部有雨',
  'light drizzle': '毛毛雨', 'patchy light drizzle': '局部毛毛雨', 'freezing drizzle': '冻毛毛雨',
  'light rain': '小雨', 'patchy light rain': '局部小雨', 'moderate rain': '中雨', 'moderate rain at times': '间歇中雨',
  'heavy rain': '大雨', 'heavy rain at times': '间歇大雨', 'torrential rain shower': '暴雨',
  'light rain shower': '小阵雨', 'moderate or heavy rain shower': '中到大阵雨',
  'thundery outbreaks possible': '可能有雷雨', 'patchy light rain with thunder': '局部雷阵雨',
  'moderate or heavy rain with thunder': '中到大雷雨',
  'light snow': '小雪', 'patchy light snow': '局部小雪', 'moderate snow': '中雪', 'heavy snow': '大雪',
  blizzard: '暴风雪', 'patchy snow nearby': '局部有雪', 'light snow showers': '小阵雪',
  'moderate or heavy snow showers': '中到大阵雪', 'patchy light snow with thunder': '局部雷雪',
  'moderate or heavy snow with thunder': '中到大雷雪',
  'ice pellets': '冰粒', 'light showers of ice pellets': '小冰粒', 'moderate or heavy showers of ice pellets': '中到大冰粒',
  'light freezing rain': '冻雨', 'moderate or heavy freezing rain': '强冻雨',
  'light sleet': '小雨夹雪', 'moderate or heavy sleet': '中到大雨夹雪',
  'patchy freezing drizzle nearby': '局部冻毛毛雨',
};

export function zhWeather(en) {
  const raw = String(en ?? '').trim();
  if (!raw) return '未知';
  const key = raw.toLowerCase();
  if (WEATHER_ZH[key]) return WEATHER_ZH[key];
  for (const [k, v] of Object.entries(WEATHER_ZH)) if (key.includes(k)) return v;
  return raw;
}

// 欧洲 AQI 分级（open-meteo 的 european_aqi）
export function aqiLabel(aqi) {
  if (aqi == null) return null;
  if (aqi <= 20) return { level: '优', advice: `空气质量优（AQI ${aqi}），适合出去走走` };
  if (aqi <= 40) return { level: '良', advice: `空气不错（AQI ${aqi}），可以出门转转` };
  if (aqi <= 60) return { level: '中等', advice: `空气一般（AQI ${aqi}），敏感人群少出门` };
  if (aqi <= 80) return { level: '较差', advice: `空气较差（AQI ${aqi}），出门戴口罩、减少户外` };
  return { level: '很差', advice: `空气很差（AQI ${aqi}），尽量待在室内` };
}

const num = (x) => {
  const n = Number(String(x ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

async function fetchAir(lat, lon) {
  if (lat == null || lon == null) return null;
  try {
    const res = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10&timezone=Asia%2FShanghai`,
      { signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const cur = json?.current ?? {};
    return { aqi: cur.european_aqi ?? null, pm25: cur.pm2_5 ?? null };
  } catch {
    return null;
  }
}

export async function buildWeatherReport(city, { days = 3 } = {}) {
  const place = String(city ?? '').trim();
  if (!place) throw new Error('城市不能为空');
  const dayCount = Math.min(3, Math.max(1, Number(days) || 3));

  const res = await fetch(`https://wttr.in/${encodeURIComponent(place)}?format=j1&lang=zh`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`天气服务 HTTP ${res.status}`);
  const data = await res.json();
  const cur = data?.current_condition?.[0];
  if (!cur) throw new Error('天气服务没有返回当前天气');

  const desc = (x) => zhWeather(x?.weatherDesc?.[0]?.value);
  const area = data?.nearest_area?.[0] ?? {};
  const labels = ['今天', '明天', '后天'];

  const daysOut = (data?.weather ?? []).slice(0, dayCount).map((d, idx) => {
    const hourly = Array.isArray(d.hourly) ? d.hourly : [];
    const rain = Math.max(0, ...hourly.map((h) => num(h.chanceofrain)));
    const wind = Math.max(0, ...hourly.map((h) => num(h.windspeedKmph)));
    const midday = hourly[4] ?? hourly[0];
    return {
      label: labels[idx] ?? d.date,
      date: String(d.date ?? '').slice(5),
      min: d.mintempC,
      max: d.maxtempC,
      desc: desc(midday),
      rain,
      wind,
    };
  });

  const air = await fetchAir(area?.latitude, area?.longitude);

  const lines = [];
  const curBits = [
    `${num(cur.temp_C)}°C（体感 ${num(cur.FeelsLikeC)}°C）`,
    desc(cur),
    `湿度 ${num(cur.humidity)}%`,
    `风 ${num(cur.windspeedKmph)}km/h`,
  ];
  if (num(cur.visibility) > 0) curBits.push(`能见度 ${num(cur.visibility)}km`);
  lines.push(`${place} 现在 ${curBits.join('，')}`);

  if (air && air.aqi != null) {
    const pm = air.pm25 != null ? `，PM2.5 ${Math.round(air.pm25)}μg/m³` : '';
    lines.push(`空气质量 ${aqiLabel(air.aqi)?.level ?? '未知'}（AQI ${air.aqi}${pm}）`);
  }

  for (const d of daysOut) {
    lines.push(`${d.label}（${d.date}）${d.min}~${d.max}°C ${d.desc}，降雨概率 ${d.rain}%，风 ${d.wind}km/h`);
  }

  const advice = [];
  const rainMax = Math.max(0, ...daysOut.map((d) => d.rain));
  const windMax = Math.max(0, ...daysOut.map((d) => d.wind));
  const todayRainy = daysOut[0] && /雨/.test(String(daysOut[0].desc ?? ''));
  if (todayRainy && num(daysOut[0].rain) < 40) advice.push(`今天${daysOut[0].desc}，出门记得带伞`);
  else if (rainMax >= 40) advice.push(`降雨概率最高 ${rainMax}%，出门记得带伞`);
  if (windMax >= 30) advice.push(`风力最大 ${windMax}km/h，风大，围巾和防风外套安排上`);
  if (daysOut[0]) {
    const swing = num(daysOut[0].max) - num(daysOut[0].min);
    if (swing >= 10) advice.push(`今天昼夜温差 ${swing}°C，早晚加件外套`);
  }
  if (daysOut.length >= 2) {
    const drop = num(daysOut[0].max) - num(daysOut[1].max);
    if (drop >= 5) advice.push(`明天最高温比今天低 ${drop}°C，注意加衣服`);
    else if (drop <= -5) advice.push(`明天最高温比今天高 ${Math.abs(drop)}°C，可以少穿点`);
  }
  const minAll = Math.min(...daysOut.map((d) => num(d.min)));
  if (minAll <= 5) advice.push(`最低温 ${minAll}°C，注意保暖`);
  if (num(cur.uvIndex) >= 6) advice.push(`紫外线指数 ${num(cur.uvIndex)}，注意防晒`);
  const airAdvice = air ? aqiLabel(air.aqi)?.advice : null;
  if (airAdvice) advice.push(airAdvice);
  if (advice.length) lines.push('', '建议：', ...advice.slice(0, 4).map((a) => `· ${a}`));

  return lines.join('\n');
}
