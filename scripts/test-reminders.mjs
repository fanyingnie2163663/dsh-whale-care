// 离线单测：不联网，只验证提醒的时间/去重/天气条件判断。
import path from 'node:path';
import process from 'node:process';

process.env.DSH_HOME = path.resolve('tmp-dsh-test');
const R = await import('../lib/reminders.js');
const { addReminder, loadReminders, saveReminders, dueReminders, evaluateWeatherReminder, describeReminder } = R;

const at = (h, m, day = 30) => new Date(2026, 9, day, h, m);
const assert = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) process.exitCode = 1; };

await R.saveReminders([]);
const med = await addReminder({ label: '吃降压药', time: '08:00', intent: 'text' });
assert(!!med.id, '新增文本提醒');
let items = await loadReminders();
assert(dueReminders(items, at(8, 5)).length === 1, '08:05 在 2 小时补发窗口内 → 应触发');
assert(dueReminders(items, at(7, 30)).length === 0, '07:30 未到点 → 不触发');
assert(dueReminders(items, at(10, 30)).length === 0, '10:30 超出 2 小时窗口 → 不触发');
items[0].lastFiredDate = R.todayKey(at(8, 5));
await saveReminders(items);
assert(dueReminders(await loadReminders(), at(8, 6)).length === 0, '今天已发过 → 不重复触发');

const rain = await addReminder({ label: '记得带伞', time: '07:00', intent: 'weather', weather: { type: 'rain', threshold: 40 } });
const data = {
  days: [
    { rain: 78, wind: 12, max: 20, min: 10, hours: { h9: 12, h15: 20, h21: 11 } },
    { rain: 10, wind: 8, max: 13, min: 6, hours: {} },
  ],
  air: { aqi: 72 },
};
const rainEval = evaluateWeatherReminder(rain, data);
assert(rainEval.matched && rainEval.line.includes('78%'), `降雨条件命中：${rainEval.line}`);

const drop = await addReminder({ label: '加衣服', time: '21:00', intent: 'weather', weather: { type: 'tempDrop', threshold: 5 } });
const dropEval = evaluateWeatherReminder(drop, data);
assert(dropEval.matched && dropEval.line.includes('低 7°C'), `降温条件命中：${dropEval.line}`);

const swing = await addReminder({ label: '带外套', time: '07:00', intent: 'weather', weather: { type: 'swing', threshold: 10 } });
const swingEval = evaluateWeatherReminder(swing, data);
assert(swingEval.matched && swingEval.line.includes('温差 10°C'), `温差条件命中：${swingEval.line}`);

const aqi = await addReminder({ label: '戴口罩', time: '07:00', intent: 'weather', weather: { type: 'aqi', threshold: 60 } });
const aqiEval = evaluateWeatherReminder(aqi, data);
assert(aqiEval.matched && aqiEval.line.includes('72'), `空气质量命中：${aqiEval.line}`);

const notMatch = evaluateWeatherReminder({ ...rain, weather: { type: 'rain', threshold: 90 } }, data);
assert(!notMatch.matched, '阈值 90% 时不应命中');

console.log('\n提醒列表：');
for (const it of await loadReminders()) console.log(' -', describeReminder(it));
