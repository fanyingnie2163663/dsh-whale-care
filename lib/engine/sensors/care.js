// 关心传感器：把 care.js 里散落的 if/else 折成「信号」。
// 只回答「今天哪些事值得说、各有多重要」；阈值与互斥在这里，怎么说归 voice/。
//
// Signal = { topic, weight, confidence, params }
//   weight     0–100。沿用改造前 care.js 的整数优先级（95/90/88/80/78/75/70/65/55/40），
//              judge 按它降序取前三，顺序与老的 tips.sort 逐条一致。
//   confidence 0–1，数据有多可靠（预报比实况低一点）。
//   params     渲染这句话要用的数字与布尔；措辞与句式全部留在 voice/。

/**
 * 从逐小时降雨概率里找"最可能下雨的那一个小时"。
 * wttr 是 3 小时一段（0/3/…/21），open-meteo 是逐小时，口径都能用。
 */
export function peakRainHour(day, minProb = 50) {
  const list = Array.isArray(day?.rainHours) ? day.rainHours : [];
  let best = null;
  for (const item of list) {
    const hour = Number(item?.hour);
    const prob = Number(item?.prob);
    if (!Number.isFinite(hour) || !Number.isFinite(prob) || hour < 0 || hour > 23) continue;
    if (prob < minProb) continue;
    if (!best || prob > best.prob || (prob === best.prob && hour < best.hour)) best = { hour, prob };
  }
  return best;
}

/**
 * 把一份 fetchWeather 的结果读成「今天的事实」。
 * 只做降级与取值，不做判断、不产出文字——结构句和信号共用这一份口径。
 */
export function careFrame(data = {}, now = new Date()) {
  const place = typeof data?.place === 'string' && data.place ? data.place : '你那边';
  const cur = data?.now && typeof data.now === 'object' ? data.now : {};
  const air = data?.air ?? null;
  const days = Array.isArray(data?.days) ? data.days : [];
  const hour = now.getHours();
  const today = days[0] ?? null;
  const tomorrow = days[1] ?? null;
  // 晚上（17 点后）说的是明天的区间，白天说今天的
  const hoursDay = hour >= 17 && tomorrow ? tomorrow : today;
  const hasRange = Boolean(hoursDay) && hoursDay.min != null && hoursDay.max != null;
  const swing = hasRange ? hoursDay.max - hoursDay.min : null;
  return {
    place,
    cur,
    air,
    days,
    hour,
    today,
    tomorrow,
    hoursDay,
    hoursDayLabel: hoursDay === tomorrow ? '明天' : '今天',
    evening: hour >= 17,
    hasRange,
    swing,
    // 区间句里已经把温差说了（>=8°C），就不再单独补一条温差提醒
    swingCovered: hasRange && swing >= 8,
  };
}

const signal = (topic, weight, confidence, params) => ({ topic, weight, confidence, params });

/**
 * 把「今天的事实」折成信号。
 * 互斥关系（有降温就不再说今天凉、区间句说了温差就不再提醒）在这里处理，
 * judge 只负责去重、排序、限量。
 *
 * @param {ReturnType<typeof careFrame>} frame
 * @param {object} [profile]
 */
export function collectCareSignals(frame, profile = {}) {
  const { today, tomorrow, days, air, cur, hour, evening } = frame;
  const coldSensitive = profile.coldSensitive === true;
  const heatSensitive = profile.heatSensitive === true;
  const commute = profile.commute || '';
  const signals = [];

  // 降温 / 加衣（有降温就不再补"今天凉"）
  if (tomorrow && today) {
    const drop = today.max - tomorrow.max;
    if (drop >= (coldSensitive ? 3 : 5)) {
      signals.push(signal('temp-drop', 95, 0.75, { tomorrowMax: tomorrow.max, drop, coldSensitive }));
    } else if (today.min <= (coldSensitive ? 8 : 5)) {
      signals.push(signal('cold', 70, 0.8, { min: today.min, evening }));
    }
  }
  // 昼夜温差：区间句已说过的不重复；晚上也别再说"早上出门"
  if (!frame.swingCovered && today && today.max - today.min >= 10 && hour < 17) {
    signals.push(signal('swing', 65, 0.7, { swing: today.max - today.min, hour }));
  }
  // 下雨 / 带伞：逐小时有峰值时，把"有雨"落到"几点"
  if (today) {
    const peak = peakRainHour(today, 50);
    const rainy = /雨/.test(today.desc) || today.rain >= 40;
    if (rainy) {
      signals.push(signal('rain', 90, 0.8, { rain: today.rain, hasUmbrella: profile.hasUmbrella, peak, commute, evening }));
    } else if (peak) {
      // 全天概率不高、但某个小时会下雨：这种最容易忘带伞
      signals.push(signal('rain-peak', 88, 0.7, { peak, evening }));
    }
  }
  // 风：取整段预报里最大的风，不只看今天
  const windMax = Math.max(0, ...days.map((d) => d.wind));
  if (windMax >= 30) signals.push(signal('wind', 75, 0.7, { windMax, commute }));
  // 高温（晚上就别提醒避暑了）
  if (today && hour < 18) {
    const heatAt = heatSensitive ? 28 : 32;
    if (today.max >= heatAt) signals.push(signal('heat', 80, 0.8, { max: today.max, heatSensitive }));
  }
  // 空气质量：数据源是欧洲 AQI，≤40 良、41~60 中等、>60 较差。
  // 敏感人群 41 就提醒；普通人等到"较差"再让戴口罩，免得每天都是"中等，出门戴口罩"。
  if (air && air.aqi != null) {
    const sensitive = Boolean(profile.notes && /鼻|咽|哮喘|过敏/.test(profile.notes));
    if (air.aqi >= (sensitive ? 41 : 61)) {
      signals.push(signal('aqi', 78, 0.85, { aqi: air.aqi, sensitive, evening }));
    }
  }
  // 紫外线（傍晚以后不用提醒了）
  if (cur.uv >= 6 && hour < 17) signals.push(signal('uv', 55, 0.6, { uv: cur.uv }));
  // 湿度
  if (cur.humidity >= 85) signals.push(signal('humid-high', 40, 0.6, { humidity: cur.humidity }));
  else if (cur.humidity > 0 && cur.humidity <= 30) signals.push(signal('humid-low', 40, 0.6, { humidity: cur.humidity }));

  return signals;
}
