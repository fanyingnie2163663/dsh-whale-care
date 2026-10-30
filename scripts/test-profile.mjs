// 离线单测：偏好档案的字段校验（重点是每天关心开关 dailyCare 和发送时间 careTime）。
import { sanitizeProfile, describeProfile } from '../lib/profile.js';

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

// 开关：true / false 都要能存下来
assert(sanitizeProfile({ dailyCare: false }).dailyCare === false, 'dailyCare=false 可以存');
assert(sanitizeProfile({ dailyCare: true }).dailyCare === true, 'dailyCare=true 可以存');
assert(sanitizeProfile({ dailyCare: 'false' }).dailyCare === false, 'dailyCare 接受字符串 "false"');

// 时间：只认 24 小时制 HH:MM
assert(sanitizeProfile({ careTime: '07:45' }).careTime === '07:45', 'careTime 07:45 合法');
assert(sanitizeProfile({ careTime: '00:00' }).careTime === '00:00', 'careTime 00:00 合法');
assert(sanitizeProfile({ careTime: '7:45' }).careTime === undefined, 'careTime 7:45 不合法（补零）');
assert(sanitizeProfile({ careTime: '24:00' }).careTime === undefined, 'careTime 24:00 不合法');
assert(sanitizeProfile({ careTime: '25:10' }).careTime === undefined, 'careTime 25:10 不合法');
assert(sanitizeProfile({ careTime: '早上七点' }).careTime === undefined, 'careTime 中文不合法');

// 旧字段不受影响
const full = sanitizeProfile({ city: '合肥', nickname: '老爹', coldSensitive: true, commute: 'bike', dailyCare: false, careTime: '06:50' });
assert(full.city === '合肥' && full.nickname === '老爹' && full.coldSensitive === true && full.commute === 'bike', '其它字段照常保留');
assert(full.dailyCare === false && full.careTime === '06:50', '开关和时间一起存');

// 描述里能看到开关状态
const descOff = describeProfile({ nickname: '老爹', dailyCare: false });
assert(descOff.includes('每天天气关心：关'), '关闭时 describeProfile 有提示');
const descTime = describeProfile({ nickname: '老爹', careTime: '06:50' });
assert(descTime.includes('天气关心时间 06:50'), '设置时间时 describeProfile 有提示');
const descDefault = describeProfile({ nickname: '老爹' });
assert(!descDefault.includes('每天天气关心'), '默认（开）时不啰嗦');
