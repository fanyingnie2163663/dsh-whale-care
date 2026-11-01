// 离线单测：多城市 / 出差（travelCity + travelUntil）。
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { writeFile, readFile } from 'node:fs/promises';

process.env.DSH_HOME = path.join(os.tmpdir(), `dsh-whale-care-travel-${process.pid}`);
const P = await import('../lib/profile.js');

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return P.dateKey(d);
};

// 格式校验
assert(P.isDateKey('2026-11-05') === true, '2026-11-05 是合法日期');
assert(P.isDateKey('2026-02-30') === false, '2026-02-30 不是合法日期');
assert(P.sanitizeProfile({ travelUntil: '2026-13-01' }).travelUntil === undefined, '非法 travelUntil 被丢弃');

// 设置出差：默认城市不变，effectiveProfile 用出差城市
await P.saveProfile({ city: '合肥', nickname: '老爹' });
await P.saveProfile({ travelCity: '上海', travelUntil: plusDays(3) });
const eff = await P.effectiveProfile();
assert(eff.city === '上海', '出差期间 effectiveProfile.city = 上海');
assert(eff.defaultCity === '合肥', 'defaultCity 保留 合肥');
const desc = P.describeProfile(eff);
assert(desc.includes('当前城市 上海'), 'describe 显示当前城市');
assert(desc.includes('默认城市 合肥'), 'describe 同时显示默认城市');

// 最后一天仍然算出差
await P.saveProfile({ travelCity: '上海', travelUntil: plusDays(0) });
assert(P.travelActive(await P.loadProfile()), 'travelUntil=今天 仍然有效');
assert((await P.effectiveProfile()).city === '上海', '最后一天仍用出差城市');

// 过期后自动回退（直接写文件模拟历史数据）
const file = P.profilePath();
const raw = JSON.parse(await readFile(file, 'utf8'));
await writeFile(file, JSON.stringify({ ...raw, travelCity: '上海', travelUntil: '2020-01-01' }), 'utf8');
const expired = await P.effectiveProfile();
assert(expired.city === '合肥', '过期出差 → 回退默认城市');
assert(!P.travelActive(expired), '过期出差 travelActive=false');

// 过去的日期拒绝写入
let past = '';
try { await P.saveProfile({ travelCity: '北京', travelUntil: '2020-01-01' }); } catch (e) { past = e.message; }
assert(/不能早于今天/.test(past), 'travelUntil 早于今天 → 报错');

// 清空
await P.saveProfile({}, { clear: ['travelCity', 'travelUntil'] });
const cleared = await P.loadProfile();
assert(!cleared.travelCity && !cleared.travelUntil, 'clear 可以取消出差');
assert((await P.effectiveProfile()).city === '合肥', '取消后回到默认城市');

console.log('\n偏好：', P.describeProfile(await P.effectiveProfile()));
