// 离线单测：关心话术的措辞、数字口径和穿衣建议。
//
// 起因：04:58 的每日关心发成了「合肥今天19到24，早晚差十度」。
// 19→24 只有 5 度，10 度是「全天最低 14 → 最高 24」的口径；
// 旧文案把两个口径塞进一句「早上 19°C，下午 24°C，...，一天差 10°C」，读起来就是算错了。
// 现在改成「区间 + 温差 + 穿衣建议」，这个单测锁住口径，也锁住温度带。
import { buildCareBrief, outfitFor } from '../lib/care.js';

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

const data = {
  place: '合肥',
  now: { temp: 16, feels: 14, desc: '霾', humidity: 56, uv: 2 },
  air: { aqi: 77, pm25: 82 },
  days: [
    { label: '今天', date: '10-31', min: 14, max: 24, desc: '多云', rain: 18, wind: 22, precip: 0, hours: { h9: 19, h15: 24, h21: 20 } },
    { label: '明天', date: '11-01', min: 12, max: 20, desc: '小雨', rain: 81, wind: 26, precip: 3, hours: { h9: 13, h15: 20, h21: 16 } },
  ],
};

const brief = buildCareBrief(data, { city: '合肥', nickname: '老爹' }, { now: new Date(2026, 9, 31, 7, 30) });

console.log('\n—— 话术 ——\n' + brief + '\n');

assert(brief.startsWith('老爹，'), '称呼「老爹」出现在开头');
assert(brief.includes('今天 14~24°C'), '温度给区间且带单位（今天 14~24°C）');
assert(brief.includes('温差 10°C'), '温差用 min/max 算（14→24 = 10°C）');
assert(!brief.includes('一天差'), '不再出现「一天差 10°C」这种和分时段数字打架的说法');
assert(!/\d+到\d+/.test(brief), '没有「19到24」这种没有单位、看不出是温度的写法');
assert(brief.includes('白天穿短袖或薄长袖'), '白天按最高温 24°C 给穿衣建议');
assert(brief.includes('早晚加件夹克或毛衣'), '早晚按最低温 14°C 给穿衣建议');

// 收尾不能替人安排行程：只有知道要出门（profile.commute）才说「路上小心」
assert(!brief.includes('路上小心'), '没设置出行方式 → 不说「路上小心」');
assert(brief.includes('早饭记得吃'), '没设置出行方式 → 用中性收尾');
const walker = buildCareBrief(data, { nickname: '老爹', commute: 'walk' }, { now: new Date(2026, 9, 31, 7, 30) });
assert(walker.includes('路上小心'), '设置了出行方式（步行）才说「路上小心」');
const homebody = buildCareBrief(data, { nickname: '老爹', commute: 'none' }, { now: new Date(2026, 9, 31, 7, 30) });
assert(!homebody.includes('路上小心'), 'commute=none（基本不出门）不说「路上小心」');

// 穿衣温度带：越冷越厚，怕冷的人整体下调一档
assert(outfitFor(30).day.includes('短袖'), '30°C → 短袖');
assert(outfitFor(22).day.includes('长袖'), '22°C → 长袖');
assert(outfitFor(18).day.includes('薄外套'), '18°C → 薄外套');
assert(outfitFor(13).day.includes('夹克'), '13°C → 夹克');
assert(outfitFor(9).day.includes('厚外套'), '9°C → 厚外套');
assert(outfitFor(5).day.includes('棉服'), '5°C → 棉服');
assert(outfitFor(-3).day.includes('羽绒'), '-3°C → 羽绒服');
assert(outfitFor(20, { coldSensitive: true }).day === outfitFor(18).day, '怕冷：20°C 按 18°C 穿');
assert(outfitFor(20, { heatSensitive: true }).day === outfitFor(22).day, '怕热：20°C 按 22°C 穿');

// 温差小的平静日子不该硬凑温差提示，也别乱加衣服
const calm = buildCareBrief(
  {
    place: '合肥',
    now: { temp: 20, feels: 20, desc: '晴', humidity: 50, uv: 3 },
    air: { aqi: 30, pm25: 10 },
    days: [{ label: '今天', date: '10-31', min: 18, max: 22, desc: '晴', rain: 0, wind: 8, precip: 0, hours: { h9: 19, h15: 22, h21: 20 } }],
  },
  { nickname: '老爹' },
  { now: new Date(2026, 9, 31, 9, 0) },
);
assert(!calm.includes('温差'), '温差 4°C 的平静日子不提温差');
assert(calm.includes('白天穿长袖衬衫或薄卫衣'), '22°C 平静日子的穿衣建议正常');
