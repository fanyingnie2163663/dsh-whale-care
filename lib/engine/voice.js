// 说话层：把判断层选中的信号，说成一段像人的话。
// 只做措辞，不做判断：说什么、谁排前面由 sensors/ 与 judge/ 决定。
// 没有信号就返回空串——绝不无话找话。

import { aqiLabel } from '../weather.js';
import { festivalLine, festivalOf } from '../festivals.js';

const COMMUTE_TEXT = { walk: '步行', bike: '骑车', transit: '公交地铁', drive: '开车', none: '基本不出门' };

/** 出行方式的中文说法。 */
export function commuteText(commute) {
  return COMMUTE_TEXT[commute] || commute;
}

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

function nameOf(profile = {}) {
  const nickname = typeof profile.nickname === 'string' ? profile.nickname.trim() : '';
  return nickname ? nickname + '，' : '';
}

function greetingOf(hour) {
  if (hour < 5) return '这么晚还没睡';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 23) return '晚上好';
  return '夜深了';
}

const hourText = (h) => `${Math.max(0, Math.min(23, Math.round(h)))} 点`;

function closingOf(hour, profile = {}) {  // 只有确实知道对方要出门（profile.commute 有值且不是 none）才说"路上小心"。
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

function sentenceOf(signal) {
  const text = typeof signal?.text === 'string' ? signal.text.trim() : '';
  const hint = typeof signal?.hint === 'string' ? signal.hint.trim() : '';
  if (!text) return '';
  return hint ? text + '，' + hint : text;
}

/**
 * 短版：care_brief 用。把信号说成一句，提醒跟在后面。
 * @param {{signals?: Array, profile?: object, extras?: Array<{time?:string,label?:string}>, now?: Date}} [input]
 * @returns {string} 一段可以直接发给用户的话；没有可说的返回 ''
 */
export function renderBrief({ signals = [], profile = {}, extras = [], now = new Date() } = {}) {
  void now;
  const said = (Array.isArray(signals) ? signals : []).map(sentenceOf).filter(Boolean);
  const extra = (Array.isArray(extras) ? extras : [])
    .filter((e) => e && e.label)
    .map((e) => (e.time ? e.time + ' ' : '') + e.label);
  const body = said.join('；');
  const tail = extra.length ? '另外：' + extra.join('；') : '';
  const parts = [body, tail].filter(Boolean);
  if (!parts.length) return '';
  return nameOf(profile) + parts.join('。') + '。';
}

// ── 全量：weather_care 用（原 care.js 的整段关心）──────────────────────
// 结构句（开场 / 温度区间 + 穿衣 / 节日 / 提醒 / 明日预告 / 收尾）由上下文直接说，
// 提醒类的短句由 judge 选出的信号按 topic 渲染。

/** @param {any} frame @param {any} profile */
function openingSentence(frame, profile) {
  const { place = '你那边', cur = {}, air = null, today = null, hour = 0 } = frame ?? {};
  const name = profile.nickname ? `${profile.nickname}，` : '';
  let opening = `${name}${greetingOf(hour)}。`;
  if (cur.temp != null) {
    opening += `${place}现在 ${cur.temp}°C`;
    // 体感一直给：和实测温度差得多时，读者才知道"为什么感觉不一样"
    if (cur.feels != null && Number.isFinite(Number(cur.feels))) opening += `（体感 ${cur.feels}°C）`;
    if (cur.desc) opening += `，${cur.desc}`;
    if (cur.humidity != null) opening += `，湿度 ${cur.humidity}%`;
    // 空气差的时候留给下面的提醒去说，开场只说好的情况，避免同一句里重复
    if (air && air.aqi != null && air.aqi <= 40) opening += `，空气${aqiLabel(air.aqi)?.level ?? '不错'}`;
    opening += '。';
  } else if (today && today.min != null && today.max != null) {
    // 没有实时数据就退化成只报区间，不硬编温度
    opening += `${place}今天 ${today.min}~${today.max}°C。`;
  }
  return opening;
}

// 一天里温度不是固定的，但分时段数字（9/15/21 点）和"全天温差"是两个口径，
// 混在一句里会读成「早上 19°C，下午 24°C，一天差 10°C」——19 到 24 只有 5 度。
// 所以只给"区间 + 温差"，再接一句按温度带查出来的穿衣建议：口径单一、可执行。
function rangeSentence(frame, profile) {
  if (!frame.hasRange) return '';
  const { hoursDay, hoursDayLabel, swing } = frame;
  const dayWear = outfitFor(hoursDay.max, profile).day;
  const nightWear = outfitFor(hoursDay.min, profile).night;
  let line = `${hoursDayLabel} ${hoursDay.min}~${hoursDay.max}°C`;
  if (swing >= 8) line += `，温差 ${Math.round(swing)}°C`;
  line += `。白天穿${dayWear}，${nightWear}。`;
  return line;
}

// 今天要记得的事（提醒引擎的预告；最多列 3 条，免得一条消息变成清单）
function remindersSentence(reminders) {
  const list = Array.isArray(reminders) ? reminders.filter(Boolean) : [];
  if (!list.length) return '';
  const parts = list.slice(0, 3).map((r) => {
    if (typeof r === 'string') return r.trim();
    const label = String(r.label ?? r.text ?? '').trim();
    const time = String(r.time ?? '').trim();
    return [time, label].filter(Boolean).join(' ');
  }).filter(Boolean);
  if (!parts.length) return '';
  const more = list.length > 3 ? `等 ${list.length} 条` : '';
  return `今天要记得：${parts.join('；')}${more}。`;
}

// 晚上多给一句明天的预告（温度区间上面已经说过，这里不重复）
function tomorrowPreview(hour, tomorrow) {
  if (!(hour >= 18 && tomorrow)) return '';
  let preview = `明天${tomorrow.desc}`;
  if (tomorrow.rain >= 40) preview += `，降雨概率 ${tomorrow.rain}%，伞先放门口`;
  return preview + '。';
}

/** 一个信号说成一句话；topic 由 sensors 决定，措辞只在这里。 */
function renderSignal(signal) {
  const p = signal.params ?? {};
  switch (signal.topic) {
    case 'temp-drop':
      return `明天最高只有 ${p.tomorrowMax}°C，比今天低 ${Math.round(p.drop)}°C，${p.coldSensitive ? '你怕冷，外套和长裤都别省' : '别只穿一件'}。`;
    case 'cold':
      return `${p.evening ? '今晚' : '今天'}最低 ${p.min}°C，${p.evening ? '夜里凉，回去加一件' : '早晚凉，出门加一件'}。`;
    case 'swing':
      return `今天早晚温差 ${Math.round(p.swing)}°C，${p.hour < 12 ? '早上出门套件外套' : '晚上回去加件外套'}。`;
    case 'rain': {
      const dayWord = p.evening ? '今晚' : '今天';
      let text;
      if (p.hasUmbrella === false) text = `${dayWord}有雨（${p.rain}%），你平时老忘带伞，记得塞包里。`;
      else if (p.hasUmbrella === true) text = `${dayWord}有雨（${p.rain}%），伞带着就行。`;
      else text = `${dayWord}有雨（${p.rain}%），出门带把伞。`;
      if (p.peak && p.peak.prob > (p.rain ?? 0)) {
        text += `${hourText(p.peak.hour)}前后概率最高 ${p.peak.prob}%，那个时段尽量别在外面。`;
      } else if (p.peak) {
        text += `${hourText(p.peak.hour)}前后降雨概率 ${p.peak.prob}%。`;
      }
      if (p.commute === 'bike') text += '骑车路滑，慢一点。';
      else if (p.commute === 'walk') text += '路上积水，绕着走。';
      return text;
    }
    case 'rain-peak':
      return `${p.evening ? '今晚' : '今天'}${hourText(p.peak.hour)}前后降雨概率 ${p.peak.prob}%，这个时段出门带把伞。`;
    case 'wind': {
      let text = `风有 ${p.windMax}km/h，围巾戴上，别让脖子灌风。`;
      if (p.commute === 'bike') text += '逆风别硬撑，能推一段就推一段。';
      return text;
    }
    case 'heat':
      return `今天最高 ${p.max}°C，多喝水${p.heatSensitive ? '，你怕热，正午尽量别在外面' : '，中午尽量待阴凉处'}。`;
    case 'aqi': {
      const mask = p.sensitive
        ? (p.evening ? '你鼻子敏感，明天口罩戴好' : '你鼻子敏感，口罩戴好')
        : (p.evening ? '明天出门戴口罩' : '出门戴口罩');
      return `空气${aqiLabel(p.aqi)?.level}（AQI ${p.aqi}），${mask}。`;
    }
    case 'uv':
      return `紫外线指数 ${p.uv}，防晒别偷懒。`;
    case 'humid-high':
      return `湿度 ${p.humidity}%，有点闷，记得通风。`;
    case 'humid-low':
      return `湿度只有 ${p.humidity}%，空气干，多喝水、抹点润唇膏。`;
    default:
      return '';
  }
}

/**
 * 全量关心：结构句 + judge 选中的信号 + 提醒 + 收尾。
 *
 * @param {{frame?: any, profile?: any, now?: Date, reminders?: any, festival?: any, signals?: any[]}} [input]
 *   frame: careFrame() 的结果（时段、今天/明天、是否已说过温差都在里面）
 *   signals: judge() 选中的信号，说哪几条由它决定
 * @returns {string} 一段可以直接发给用户的话
 */
export function renderCareBrief({ frame = {}, profile = {}, now = new Date(), reminders = null, festival = undefined, signals = [] } = {}) {
  const { hour, tomorrow } = frame;
  const sentences = [openingSentence(frame, profile)];

  // 节日 / 节气：给这一天一个由头，也提醒该做的事（可被调用方关掉）
  const fest = festival === false ? null : (festival ?? festivalOf(now));
  const festText = festivalLine(fest);
  if (festText) sentences.push(festText);

  const range = rangeSentence(frame, profile);
  if (range) sentences.push(range);

  for (const item of Array.isArray(signals) ? signals : []) {
    const text = renderSignal(item);
    if (text) sentences.push(text);
  }

  const rem = remindersSentence(reminders);
  if (rem) sentences.push(rem);

  const preview = tomorrowPreview(hour, tomorrow);
  if (preview) sentences.push(preview);

  sentences.push(closingOf(hour, profile));
  return sentences.join('');
}
