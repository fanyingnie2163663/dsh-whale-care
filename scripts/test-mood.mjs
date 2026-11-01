// 离线单测：情绪记录与趋势。
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';

process.env.DSH_HOME = path.join(os.tmpdir(), `dsh-whale-care-mood-${process.pid}`);
const M = await import('../lib/mood.js');

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

let bad = '';
try { await M.addMood({ score: 6 }); } catch (e) { bad = e.message; }
assert(/1~5/.test(bad), 'score=6 报错');
bad = '';
try { await M.addMood({ score: 0 }); } catch (e) { bad = e.message; }
assert(/1~5/.test(bad), 'score=0 报错');

const at = new Date(2026, 10, 1, 21, 30).getTime();
const a = await M.addMood({ score: 4, note: '还行', at });
assert(a.date === '2026-11-01' && a.score === 4, '记录日期/分数');
const dup = await M.addMood({ score: 4, note: '还行', at: at + 1000 });
assert((await M.loadMoods()).length === 1, '同一分钟重复提交只留一条');

await M.addMood({ score: 2, at: new Date(2026, 10, 2, 22, 0).getTime() });
await M.addMood({ score: 5, at: new Date(2026, 10, 2, 23, 0).getTime() });
const entries = await M.loadMoods();
assert(entries.length === 3, '三条记录');
const trend = M.moodTrend(entries, { days: 7, now: new Date(2026, 10, 2, 23, 30) });
assert(trend.length === 2, '趋势按天聚合（2 天）');
const day2 = trend.find((d) => d.date === '2026-11-02');
assert(day2 && day2.avg === 3.5 && day2.count === 2, '11-02 两次记录均分 3.5');
const summary = M.moodSummary(trend, { days: 7 });
assert(summary.includes('3 次') && summary.includes('平均'), '总结里有次数和均分');
assert(M.describeMood(entries[0]).includes('4 分'), 'describe 带分数');
assert(M.describeMood(entries[0]).includes('还行'), 'describe 带备注');

// 超出 14 天窗口的旧记录不进趋势
const old = [...entries, { id: 'old', at: new Date(2026, 9, 1, 9, 0).getTime(), date: '2026-10-01', score: 1, note: '' }];
const short = M.moodTrend(old, { days: 7, now: new Date(2026, 10, 2, 23, 30) });
assert(short.length === 2 && !short.some((d) => d.date === '2026-10-01'), '窗口外旧记录被排除');
