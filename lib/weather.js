// 取数 + 详细播报（不含"关心"表达，那部分在 care.js）。
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
  if (aqi <= 20) return { level: '优', advice: '空气很好，适合出去走走' };
  if (aqi <= 40) return { level: '良', advice: '空气不错，可以出门转转' };
  if (aqi <= 60) return { level: '中等', advice: '空气一般，敏感人群少在外面待' };
  if (aqi <= 80) return { level: '较差', advice: '空气较差，出门戴口罩' };
  return { level: '很差', advice: '空气很差，尽量待在室内' };
}

export const num = (x) => {
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

/** 取结构化天气：{ place, now, air, days[], fetchedAt } */
export async function fetchWttr(city, { days = 3 } = {}) {
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
    // 降水量：wttr 的 hourly[].precipMM 是 3 小时累计，加总近似全天
    const precip = hourly.reduce((sum, h) => sum + num(h.precipMM), 0);
    const midday = hourly[4] ?? hourly[0];
    // wttr 的 hourly 固定 8 段：0/3/6/9/12/15/18/21 点
    const tempAt = (i) => (hourly[i] ? num(hourly[i].tempC) : null);
    const hours = {
      h6: tempAt(2), h9: tempAt(3), h12: tempAt(4), h15: tempAt(5), h18: tempAt(6), h21: tempAt(7)
    };
    return {
      label: labels[idx] ?? d.date,
      date: String(d.date ?? '').slice(5),
      min: num(d.mintempC),
      max: num(d.maxtempC),
      desc: desc(midday),
      rain,
      wind,
      precip,
      hours,
    };
  });

  const air = await fetchAir(area?.latitude, area?.longitude);

  return {
    place,
    now: {
      temp: num(cur.temp_C),
      feels: num(cur.FeelsLikeC),
      desc: desc(cur),
      humidity: num(cur.humidity),
      wind: num(cur.windspeedKmph),
      visibility: num(cur.visibility),
      uv: num(cur.uvIndex),
    },
    air,
    days: daysOut,
    fetchedAt: Date.now(),
  };
}

/** 详细播报（weather 工具的输出） */
export function formatDetailed(data = {}) {
  // 防御残缺数据：天气接口偶尔只返回一半字段，这里能少说就少说，别把 undefined 拼进正文
  const place = typeof data?.place === 'string' && data.place ? data.place : '这里';
  const now = data?.now && typeof data.now === 'object' ? data.now : {};
  const air = data?.air ?? null;
  const days = Array.isArray(data?.days) ? data.days.filter((d) => d && d.max != null) : [];
  if (now.temp == null && !days.length) throw new Error('天气数据不完整：既没有实时天气也没有预报');
  const lines = [];
  const bits = [];
  if (now.temp != null) bits.push(`${now.temp}°C${now.feels != null ? `（体感 ${now.feels}°C）` : ''}`);
  if (now.desc) bits.push(String(now.desc));
  if (now.humidity != null) bits.push(`湿度 ${now.humidity}%`);
  if (now.wind != null) bits.push(`风 ${now.wind}km/h`);
  if (now.visibility > 0) bits.push(`能见度 ${now.visibility}km`);
  if (bits.length) lines.push(`${place} 现在 ${bits.join('，')}`);
  if (air && air.aqi != null) {
    const pm = air.pm25 != null ? `，PM2.5 ${Math.round(air.pm25)}μg/m³` : '';
    lines.push(`空气质量 ${aqiLabel(air.aqi)?.level ?? '未知'}（AQI ${air.aqi}${pm}）`);
  }
  for (const d of days) {
    const label = d.label ?? d.date ?? '';
    const date = d.date && d.date !== label ? `（${d.date}）` : '';
    lines.push(`${label}${date}${d.min ?? '?'}~${d.max}°C ${d.desc ?? ''}，降雨概率 ${d.rain ?? 0}%，风 ${d.wind ?? 0}km/h`);
  }
  const advice = [];
  const rainMax = Math.max(0, ...days.map((d) => d.rain));
  const windMax = Math.max(0, ...days.map((d) => d.wind));
  const todayRainy = days[0] && /雨/.test(String(days[0]?.desc ?? ''));
  if (todayRainy && (days[0]?.rain ?? 0) < 40) advice.push(`今天${days[0].desc}，出门记得带伞`);
  else if (rainMax >= 40) advice.push(`降雨概率最高 ${rainMax}%，出门记得带伞`);
  if (windMax >= 30) advice.push(`风力最大 ${windMax}km/h，风大，围巾和防风外套安排上`);
  if (days[0]) {
    const swing = days[0].max - days[0].min;
    if (swing >= 10) advice.push(`今天昼夜温差 ${swing}°C，早晚加件外套`);
  }
  if (days.length >= 2) {
    const drop = days[0].max - days[1].max;
    if (drop >= 5) advice.push(`明天最高温比今天低 ${drop}°C，注意加衣服`);
    else if (drop <= -5) advice.push(`明天最高温比今天高 ${Math.abs(drop)}°C，可以少穿点`);
  }
  const minAll = Math.min(...days.map((d) => d.min));
  if (minAll <= 5) advice.push(`最低温 ${minAll}°C，注意保暖`);
  if (now.uv >= 6) advice.push(`紫外线指数 ${now.uv}，注意防晒`);
  const airAdvice = air ? aqiLabel(air.aqi)?.advice : null;
  if (airAdvice) advice.push(airAdvice);
  if (advice.length) lines.push('', '建议：', ...advice.slice(0, 4).map((a) => `· ${a}`));
  return lines.join('\n');
}

/** 兼容旧接口 */
export async function buildWeatherReport(city, opts = {}) {
  return formatDetailed(await fetchWeather(city, opts));
}
