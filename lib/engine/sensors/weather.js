// 天气传感器：把一份 fetchWeather 的结果折成若干条「信号」。
// 信号只描述事实与影响，不负责措辞——说什么、怎么说归 voice/。
//
// Signal = { topic, weight, confidence, text, hint }
//   weight     0–100，这件事今天对这个人的影响有多大
//   confidence 0–1，数据有多可靠（预报比实况低一点）

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

const dayOf = (data, i) => (Array.isArray(data?.days) ? data.days[i] : null);

function rainSignal(today) {
  const rain = num(today?.rain);
  if (rain === null || rain < 40) return null;
  return {
    topic: 'rain',
    weight: clamp(55 + rain * 0.3, 0, 95),
    confidence: 0.8,
    text: `今天降雨概率 ${rain}%`,
    hint: '带伞',
  };
}

function dropSignal(today, tomorrow) {
  const a = num(today?.max);
  const b = num(tomorrow?.max);
  if (a === null || b === null) return null;
  const drop = a - b;
  if (drop < 4) return null;
  return {
    topic: 'temp-drop',
    weight: clamp(50 + drop * 2, 0, 90),
    confidence: 0.75,
    text: `明天最高 ${b}°C，比今天低 ${Math.round(drop)}°C`,
    hint: '加件外套',
  };
}

function swingSignal(today) {
  const min = num(today?.min);
  const max = num(today?.max);
  if (min === null || max === null) return null;
  const swing = max - min;
  if (swing < 10) return null;
  return {
    topic: 'swing',
    weight: clamp(35 + swing, 0, 80),
    confidence: 0.7,
    text: `今天 ${min}~${max}°C，早晚温差 ${Math.round(swing)}°C`,
    hint: '早晚加一件',
  };
}

function windSignal(today) {
  const wind = num(today?.wind);
  if (wind === null || wind < 30) return null;
  return {
    topic: 'wind',
    weight: clamp(30 + wind * 0.6, 0, 80),
    confidence: 0.7,
    text: `今天风力 ${wind} km/h`,
    hint: '风大，围巾戴上',
  };
}

function airSignal(data) {
  const aqi = num(data?.air?.aqi);
  if (aqi === null || aqi < 100) return null;
  return {
    topic: 'aqi',
    weight: clamp(55 + (aqi - 100) * 0.25, 0, 95),
    confidence: 0.85,
    text: `空气质量指数 ${aqi}`,
    hint: aqi >= 150 ? '出门戴口罩' : '敏感的话少在户外待',
  };
}

function heatSignal(today, profile) {
  const max = num(today?.max);
  if (max === null) return null;
  const limit = profile?.heatSensitive === true ? 30 : 33;
  if (max < limit) return null;
  return {
    topic: 'heat',
    weight: clamp(45 + (max - limit) * 3, 0, 85),
    confidence: 0.8,
    text: `今天最高 ${max}°C`,
    hint: '多喝水，别在正午晒着',
  };
}

function coldSignal(today, profile) {
  const min = num(today?.min);
  if (min === null) return null;
  const limit = profile?.coldSensitive === true ? 6 : 2;
  if (min > limit) return null;
  return {
    topic: 'cold',
    weight: clamp(50 + (limit - min) * 4, 0, 90),
    confidence: 0.8,
    text: `今天最低 ${min}°C`,
    hint: '羽绒服可以拿出来了',
  };
}

function drySignal(data) {
  const humidity = num(data?.now?.humidity);
  if (humidity === null || humidity > 30) return null;
  return {
    topic: 'dry',
    weight: 30,
    confidence: 0.6,
    text: `湿度只有 ${humidity}%`,
    hint: '多喝水，注意静电',
  };
}

/** 把天气数据折成信号；没有数据的项直接跳过，不编。 */
export function collectWeatherSignals(data = {}, profile = {}, { now = new Date() } = {}) {
  void now;
  const today = dayOf(data, 0);
  const tomorrow = dayOf(data, 1);
  return [
    rainSignal(today),
    dropSignal(today, tomorrow),
    coldSignal(today, profile),
    heatSignal(today, profile),
    airSignal(data),
    swingSignal(today),
    windSignal(today),
    drySignal(data),
  ].filter(Boolean);
}
