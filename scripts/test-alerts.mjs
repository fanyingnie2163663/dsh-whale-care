// 离线单测：用构造的天气数据验证预警阈值与去重。
import { evaluateAlerts, formatAlert, todayKey } from '../lib/alerts.js';

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

const data = {
  now: { temp: 36, visibility: 0.8, uv: 8 },
  air: { aqi: 165, pm25: 120 },
  days: [
    { label: '今天', date: '10-30', min: 5, max: 38, desc: '雷阵雨', rain: 92, wind: 82, precip: 61, hours: {} },
    { label: '明天', date: '10-31', min: 3, max: 22, desc: '阴', rain: 20, wind: 18, precip: 0, hours: {} },
  ],
};

const alerts = evaluateAlerts(data);
const has = (type, level) => alerts.some((a) => a.type === type && a.level === level);

assert(has('rain', '橙'), '降水 61mm → 暴雨橙色');
assert(has('wind', '红'), '风速 82km/h → 大风红色');
assert(has('heat', '橙'), '最高 38°C → 高温橙色');
assert(has('thunder', '黄'), '雷阵雨 → 雷电黄色');
assert(has('coldwave', '红'), '24h 降温 16°C → 寒潮红色');
assert(has('fog', '黄'), '能见度 0.8km → 大雾黄色');
// 数据源是欧洲 AQI：60/80/100 三档。165 已经超过 100 → 红。
assert(has('aqi', '红'), 'AQI 165（欧洲 AQI）→ 空气污染红色');
assert(evaluateAlerts({ now: {}, air: { aqi: 70 }, days: [] }).some((a) => a.type === 'aqi' && a.level === '黄'), 'AQI 70 → 空气污染黄色');
assert(!evaluateAlerts({ now: {}, air: { aqi: 55 }, days: [] }).some((a) => a.type === 'aqi'), 'AQI 55 不触发空气预警');

const calm = evaluateAlerts({
  now: { temp: 20, visibility: 10 },
  air: { aqi: 30 },
  days: [{ label: '今天', min: 12, max: 22, desc: '晴', rain: 5, wind: 10, precip: 0, hours: {} }],
});
assert(calm.length === 0, '平静天气不产生预警');

console.log(`\n共 ${alerts.length} 条预警，今天=${todayKey()}：`);
for (const a of alerts) console.log(' -', formatAlert(a));
