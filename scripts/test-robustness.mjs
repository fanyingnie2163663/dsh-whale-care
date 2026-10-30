// 离线单测：残缺/异常天气数据下，各层不能抛错、不能把 undefined 拼进给用户的话。
//
// 起因：拿 {} 调 buildCareBrief 和 formatDetailed 会直接抛 TypeError；
// 只缺一两个字段时会把 "undefined°C"、"undefined现在" 发出去。天气接口偶尔就是会残缺，
// 尤其是桥接直发路径，抛错会让当天那条关心直接消失。
import { buildCareBrief } from '../lib/care.js';
import { formatDetailed } from '../lib/weather.js';
import { formatAlert } from '../lib/alerts.js';
import { describeReminder } from '../lib/reminders.js';

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

const clean = (text) => !/undefined|NaN|\[object Object\]/.test(String(text));

const full = {
  place: '合肥',
  now: { temp: 16, feels: 14, desc: '霾', humidity: 56, wind: 12, visibility: 8, uv: 2 },
  air: { aqi: 77, pm25: 82 },
  days: [
    { label: '今天', date: '10-31', min: 14, max: 24, desc: '多云', rain: 18, wind: 22 },
    { label: '明天', date: '11-01', min: 12, max: 20, desc: '小雨', rain: 81, wind: 26 },
  ],
};

// ── 空对象 / 残缺结构不抛错 ──────────────────────────────────────
let empty = '';
try { empty = buildCareBrief({}, {}); } catch (e) { assert(false, `buildCareBrief({}) 抛错：${e.message}`); }
assert(empty === '' || clean(empty), 'buildCareBrief({}) 不产生 undefined/NaN');

let noNow = '';
try {
  noNow = buildCareBrief({ days: [{ min: 14, max: 24, desc: '多云', rain: 10, wind: 8 }] }, { nickname: '老爹' });
} catch (e) { assert(false, `缺 now 抛错：${e.message}`); }
assert(clean(noNow) && noNow.includes('14~24°C'), '缺实时天气时退化成只报区间');

let noPlace = '';
try { noPlace = buildCareBrief({ now: { temp: 20, desc: '晴' }, days: [{ min: 10, max: 20 }] }, {}); }
catch (e) { assert(false, `缺 place 抛错：${e.message}`); }
assert(clean(noPlace), '缺 place 时用「你那边」兜底，不出现 undefined');

let junk = '';
try { junk = buildCareBrief({ place: 'x', now: { temp: 'abc', desc: null }, days: [{}] }, {}); }
catch (e) { assert(false, `脏数据抛错：${e.message}`); }
assert(clean(junk), '温度是字符串/描述为 null 时不产生 undefined');

// ── formatDetailed ────────────────────────────────────────────
let threw = false;
try { formatDetailed({}); } catch (e) { threw = /数据不完整/.test(e.message); }
assert(threw, 'formatDetailed({}) 抛出「数据不完整」而不是 TypeError');

const forecastOnly = formatDetailed({ place: '合肥', days: full.days });
assert(clean(forecastOnly) && forecastOnly.includes('今天'), '只有预报、没有实时数据也能播报');

const detailed = formatDetailed(full);
assert(clean(detailed) && detailed.includes('合肥 现在 16°C'), '完整数据正常播报');
assert(detailed.includes('空气质量 较差') || detailed.includes('AQI 77'), '空气质量段正常');

const partialNow = formatDetailed({ place: '合肥', now: { temp: 20 }, days: [] });
assert(clean(partialNow), '只有温度、缺体感/湿度/风也能播报');

// ── 其它格式化函数 ────────────────────────────────────────────
assert(clean(formatAlert({})), 'formatAlert({}) 不出现 undefined');
assert(clean(describeReminder({})), 'describeReminder({}) 不出现 undefined');

const badAlert = formatAlert({ level: '红', title: '大风红色预警' });
assert(badAlert.startsWith('🔴') && clean(badAlert), 'formatAlert 缺 detail/advice 时仍可读');
