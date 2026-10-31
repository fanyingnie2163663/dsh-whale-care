// 关心层：把结构化天气 + 用户偏好 + 当前时段，写成一段像人说的话。
//
// 设计原则：
//   · 先给结论（现在怎么样），再给 1~3 个真正影响今天的提醒，最后一句收尾；
//   · 提醒按"对这个人影响大小"排序，不是把规则全倒出来；
//   · 称呼、怕冷/怕热、出行方式、有没有伞、备注（如鼻炎）都会改变措辞与阈值；
//   · 不制造焦虑：最多一条"担心"，其余都是可执行的小事。

import { aqiLabel } from './weather.js';

const COMMUTE_TEXT = { walk: '步行', bike: '骑车', transit: '公交地铁', drive: '开车', none: '基本不出门' };

// 穿衣建议：按温度带给一句话。参考天气预报里的"穿衣指数"——
// 白天按最高温挑衣服，早晚按最低温提醒加一件；怕冷的人整体下调 2°C，怕热的上调 2°C。
const OUTFIT_BANDS = [
  { min: 28, day: '短袖短裤', night: '晚上也不凉，短袖就行' },
  { min: 24, day: '短袖或薄长袖', night: '晚上备件薄外套' },
  { min: 20, day: '长袖衬衫或薄卫衣', night: '早晚加件薄外套' },
  { min: 16, day: '薄外套配长袖', night: '早晚套件外套或风衣' },
  { min: 12, day: '夹克或风衣', night: '早晚加件夹克或毛衣' },
  { min: 8, day: '厚外套加毛衣', night: '早晚换厚外套' },
  { min: 4, day: '棉服或薄羽绒', night: '早晚棉服，围巾戴上' },
  { min: -Infinity, day: '羽绒服', night: '早晚羽绒服，围巾手套都别省' },
];

/** 按温度（和怕冷怕热偏好）取穿衣建议；白天用最高温、早晚用最低温。 */
export function outfitFor(temp, profile = {}) {
  const t = Number(temp);
  if (!Number.isFinite(t)) return { day: '外套', night: '出门前再看一眼温度' };
  const adjusted = t - (profile.coldSensitive === true ? 2 : 0) + (profile.heatSensitive === true ? 2 : 0);
  for (const band of OUTFIT_BANDS) {
    if (adjusted >= band.min) return band;
  }
  return OUTFIT_BANDS[OUTFIT_BANDS.length - 1];
}

function greetingOf(hour) {
  if (hour < 5) return '这么晚还没睡';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

function closingOf(hour, profile = {}) {
  // 只有确实知道对方要出门（profile.commute 有值且不是 none）才说"路上小心"。
  // 之前默认所有人早上都出门，等于替人安排行程——老爹根本没说过要出门。
  const commute = profile.commute || '';
  const goesOut = commute !== '' && commute !== 'none';
  if (hour < 5) return '早点睡吧，身体要紧。';
  if (hour < 11) return goesOut ? '路上小心，到了跟我说一声。' : '早饭记得吃，今天也别太赶。';
  if (hour < 14) return '别忘了吃饭。';
  if (hour < 18) return '忙完记得喝口水。';
  if (hour < 23) return '早点休息，别熬太晚。';
  return '快去睡，明天再说。';
}

/**
 * @param {{place:string, now:object, air:object|null, days:Array}} data  fetchWeather 的结果
 * @param {object} profile  用户偏好（见 profile.js）
 * @param {{now?:Date}} opts
 * @returns {string} 一段可直接发给用户的话
 */
export function buildCareBrief(data = {}, profile = {}, { now = new Date() } = {}) {
  // 天气源偶尔会返回残缺结构（接口抽风、字段改名）。这里一律降级处理，不抛错：
  // 宁可少说一句，也不要让桥接的直发路径崩掉、或者把 "undefined°C" 发给用户。
  const place = typeof data?.place === 'string' && data.place ? data.place : '你那边';
  const cur = data?.now && typeof data.now === 'object' ? data.now : {};
  const air = data?.air ?? null;
  const days = Array.isArray(data?.days) ? data.days : [];
  const hour = now.getHours();
  const name = profile.nickname ? `${profile.nickname}，` : '';
  const evening = hour >= 17;
  const coldSensitive = profile.coldSensitive === true;
  const heatSensitive = profile.heatSensitive === true;
  const commute = profile.commute || '';
  const today = days[0] ?? null;
  const tomorrow = days[1] ?? null;

  const sentences = [];

  // ── 开场：现在怎么样 ─────────────────────────────────────────────
  let opening = `${name}${greetingOf(hour)}。`;
  if (cur.temp != null) {
    opening += `${place}现在 ${cur.temp}°C${cur.desc ? `，${cur.desc}` : ''}`;
    if (Math.abs(Number(cur.feels) - Number(cur.temp)) >= 3) opening += `，体感 ${cur.feels}°C`;
    // 空气差的时候留给下面的提醒去说，开场只说好的情况，避免同一句里重复
    if (air && air.aqi != null && air.aqi <= 40) opening += `，空气${aqiLabel(air.aqi)?.level ?? '不错'}`;
    opening += '。';
  } else if (today && today.min != null && today.max != null) {
    // 没有实时数据就退化成只报区间，不硬编温度
    opening += `${place}今天 ${today.min}~${today.max}°C。`;
  }
  sentences.push(opening);

  // 一天里温度不是固定的，但分时段数字（9/15/21 点）和"全天温差"是两个口径，
  // 混在一句里会读成「早上 19°C，下午 24°C，一天差 10°C」——19 到 24 只有 5 度。
  // 所以只给"区间 + 温差"，再接一句按温度带查出来的穿衣建议：口径单一、可执行。
  const hoursDay = hour >= 17 && tomorrow ? tomorrow : today;
  let swingCovered = false;
  if (hoursDay && hoursDay.min != null && hoursDay.max != null) {
    const label = hoursDay === tomorrow ? '明天' : '今天';
    const allDaySwing = hoursDay.max - hoursDay.min;
    const dayWear = outfitFor(hoursDay.max, profile).day;
    const nightWear = outfitFor(hoursDay.min, profile).night;
    let line = `${label} ${hoursDay.min}~${hoursDay.max}°C`;
    if (allDaySwing >= 8) {
      line += `，温差 ${Math.round(allDaySwing)}°C`;
      swingCovered = true;
    }
    line += `。白天穿${dayWear}，${nightWear}。`;
    sentences.push(line);
  }

  // ── 收集提醒（带优先级，最后取前三条）─────────────────────────────
  const tips = [];
  const add = (priority, text) => tips.push({ priority, text });

  // 降温 / 加衣
  if (tomorrow && today) {
    const drop = today.max - tomorrow.max;
    const threshold = coldSensitive ? 3 : 5;
    if (drop >= threshold) {
      const extra = coldSensitive ? '你怕冷，外套和长裤都别省' : '别只穿一件';
      add(95, `明天最高只有 ${tomorrow.max}°C，比今天低 ${Math.round(drop)}°C，${extra}。`);
    } else if (today.min <= (coldSensitive ? 8 : 5)) {
      add(70, `${evening ? '今晚' : '今天'}最低 ${today.min}°C，${evening ? '夜里凉，回去加一件' : '早晚凉，出门加一件'}。`);
    }
  }
  // 昼夜温差（已经用分时段温度说过就不重复；晚上也别再说"早上出门"）
  if (!swingCovered && today && today.max - today.min >= 10 && hour < 17) {
    const when = hour < 12 ? '早上出门套件外套' : '晚上回去加件外套';
    add(65, `今天早晚温差 ${Math.round(today.max - today.min)}°C，${when}。`);
  }
  // 下雨 / 带伞
  if (today) {
    const rainy = /雨/.test(today.desc) || today.rain >= 40;
    const dayWord = evening ? '今晚' : '今天';
    if (rainy) {
      let text;
      if (profile.hasUmbrella === false) text = `${dayWord}有雨（${today.rain}%），你平时老忘带伞，记得塞包里。`;
      else if (profile.hasUmbrella === true) text = `${dayWord}有雨（${today.rain}%），伞带着就行。`;
      else text = `${dayWord}有雨（${today.rain}%），出门带把伞。`;
      if (commute === 'bike') text += '骑车路滑，慢一点。';
      else if (commute === 'walk') text += '路上积水，绕着走。';
      add(90, text);
    }
  }
  // 风
  const windMax = Math.max(0, ...days.map((d) => d.wind));
  if (windMax >= 30) {
    let text = `风有 ${windMax}km/h，围巾戴上，别让脖子灌风。`;
    if (commute === 'bike') text += '逆风别硬撑，能推一段就推一段。';
    add(75, text);
  }
  // 高温（晚上就别提醒避暑了）
  if (today && hour < 18) {
    const heatAt = heatSensitive ? 28 : 32;
    if (today.max >= heatAt) {
      add(80, `今天最高 ${today.max}°C，多喝水${heatSensitive ? '，你怕热，正午尽量别在外面' : '，中午尽量待阴凉处'}。`);
    }
  }
  // 空气质量
  if (air && air.aqi != null) {
    const sensitive = Boolean(profile.notes && /鼻|咽|哮喘|过敏/.test(profile.notes));
    // 数据源是欧洲 AQI：≤40 良、41~60 中等、>60 较差。
    // 敏感人群 41 就提醒；普通人等到"较差"再让戴口罩，免得每天都是"中等，出门戴口罩"。
    if (air.aqi >= (sensitive ? 41 : 61)) {
      add(78, `空气${aqiLabel(air.aqi)?.level}（AQI ${air.aqi}），${sensitive ? '你鼻子敏感，口罩戴好' : '出门戴口罩'}。`);
    }
  }
  // 紫外线（傍晚以后不用提醒了）
  if (cur.uv >= 6 && hour < 17) add(55, `紫外线指数 ${cur.uv}，防晒别偷懒。`);
  // 湿度
  if (cur.humidity >= 85) add(40, `湿度 ${cur.humidity}%，有点闷，记得通风。`);

  tips.sort((a, b) => b.priority - a.priority);
  for (const tip of tips.slice(0, 3)) sentences.push(tip.text);

  // ── 晚上多给一句明天的预告 ─────────────────────────────────────
  if (hour >= 18 && tomorrow) {
    let preview = `明天${tomorrow.desc}，${tomorrow.min}~${tomorrow.max}°C`;
    if (tomorrow.rain >= 40) preview += `，降雨概率 ${tomorrow.rain}%，伞先放门口`;
    preview += '。';
    sentences.push(preview);
  }

  // ── 偶尔问一句（只在信息不全时，且最多一句）────────────────────
  if (profile.hasUmbrella === undefined && today && (/雨/.test(today.desc) || today.rain >= 40)) {
    sentences.push('伞在包里吗？没有的话现在塞一把。');
  }

  sentences.push(closingOf(hour, profile));
  return sentences.join('');
}

/** 给 agent 看的"关心要点"（结构化），便于它在回复里自由发挥而不是照读 */
export function careHighlights(data, profile = {}, { now = new Date() } = {}) {
  const brief = buildCareBrief(data, profile, { now });
  const hour = now.getHours();
  const items = [];
  if (profile.coldSensitive) items.push('用户怕冷');
  if (profile.heatSensitive) items.push('用户怕热');
  if (profile.commute) items.push(`出行方式：${COMMUTE_TEXT[profile.commute] || profile.commute}`);
  if (profile.notes) items.push(`备注：${profile.notes}`);
  return {
    brief,
    hour,
    sendsAt: hour < 11 ? '早上' : hour < 18 ? '白天' : '晚上',
    profileHints: items,
  };
}
