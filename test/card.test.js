import test from 'node:test'
import nodeAssert from 'node:assert/strict'
import { makeChecker } from './harness.js'

// 离线单测：每日天气卡的版式与口径（BRIEF §3/§4/§7 里可判定的部分）。
import { buildWeatherCardSvg, CARD_SIZE, CARD_PHASE, CARD_ADVICE_MAX_WIDTH, measureCardText } from '../lib/card.js';

const { ok: assert, total } = makeChecker()

const DATA = {
  place: '合肥',
  now: { temp: 13.8, feels: 12.9, desc: '多云', humidity: 78, uv: 2, wind: 18 },
  air: { aqi: 83, pm25: 62 },
  days: [
    { label: '今天', date: '11-03', min: 13.2, max: 19, desc: '多云', rain: 96, wind: 18, precip: 0, hours: {} },
    { label: '明天', date: '11-04', min: 9, max: 15, desc: '阴', rain: 100, wind: 24, precip: 2, hours: {} },
  ],
};
const PROFILE = { city: '合肥', nickname: '阿宁', coldSensitive: true, commute: 'bike', notes: '有鼻炎' };
const at = (hour, minute) => new Date(2026, 10, 3, hour, minute);

const fontSizes = (svg) => [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
const texts = (svg) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

test('card', async () => {
const early = buildWeatherCardSvg(DATA, PROFILE, { now: at(8, 0) });
const late = buildWeatherCardSvg(DATA, PROFILE, { now: at(20, 0) });

// 1. 尺寸与基本输出
assert(early.startsWith('<svg'), '输出是 SVG');
assert(early.includes('width="' + CARD_SIZE.width + '"') && early.includes('height="' + CARD_SIZE.height + '"'), '尺寸 720×980');
assert(!/undefined|NaN/.test(early) && !/undefined|NaN/.test(late), '没有 undefined / NaN');

// 2. 早/晚只看结构：05:30 归早版、17:30 归晚版
assert(buildWeatherCardSvg(DATA, PROFILE, { now: at(5, 30) }).includes('明天 9~15°'), '05:30 归早版（明日写在页脚）');
assert(!buildWeatherCardSvg(DATA, PROFILE, { now: at(5, 29) }).includes('明天 9~15°'), '05:29 归晚版');
assert(buildWeatherCardSvg(DATA, PROFILE, { now: at(17, 29) }).includes('明天 9~15°'), '17:29 还归早版（明日写在页脚）');
assert(buildWeatherCardSvg(DATA, PROFILE, { now: at(17, 30) }).includes('明天</text>'), '17:30 归晚版（明日升为通栏）');
assert(CARD_PHASE.earlyFrom === 330 && CARD_PHASE.lateFrom === 1050, '早/晚切点常量没跑偏');

// 3. 深/浅只看主题：主题变了颜色跟着变，时段判定不受影响
const lightEarly = buildWeatherCardSvg(DATA, PROFILE, { now: at(8, 0), theme: 'light' });
const lightLate = buildWeatherCardSvg(DATA, PROFILE, { now: at(20, 0), theme: 'light' });
assert(lightEarly.includes('#F6F1E8') && lightEarly.includes('#152230'), '浅色主题有暖纸底与深墨');
assert(!lightEarly.includes('#091520') && !lightEarly.includes('#EDF4F9'), '浅色主题不混进深色色值');
assert(lightEarly.includes('明天 9~15°') && lightLate.includes('明天</text>'), '深浅只管颜色，不管早晚结构');

// 4. 字号阶梯：只用 168 / 64 / 44 / 36 / 28，没有 36 以下的小字
const sizes = [...new Set(fontSizes(early + late))].sort((a, b) => b - a);
assert(JSON.stringify(sizes) === JSON.stringify([168, 64, 44, 36, 28]), '字号档 = 168/64/44/36/28，实际 ' + sizes.join('/'));
assert(Math.min(...fontSizes(early + late)) >= 28, '没有小于 28 的字号');
const scaled = fontSizes(early + late).map((size) => size * 0.5);
assert(Math.max(...scaled) >= 72, '360 宽时焦点数字 ≥72px');
assert(scaled.includes(18), '360 宽时正文等效 18px');
assert(Math.min(...scaled) >= 14, '360 宽时全卡没有 <14px 的字');

// 5. 减法：填充面 ≤2、圆角种类 ≤2、单一 alert
const filledRects = [...early.matchAll(/<rect [^>]*fill="(?!none)[^"]+"/g)].length;
assert(filledRects <= 2, '填充面 ≤2，实际 ' + filledRects);
const radii = new Set([...(early + late).matchAll(/rx="([\d.]+)"/g)].map((m) => m[1]));
assert(radii.size <= 2, '圆角种类 ≤2，实际 ' + radii.size);
assert((early.match(/#FF6F61/g) || []).length <= 1, '深色卡最多一处 alert');

// 6. 离线自足：无外链、无位图、无 emoji、字体栈在白名单内
// xmlns 里的 http://www.w3.org/2000/svg 是命名空间，不是外链；剥掉再查
const stripNs = (svg) => svg.replace(/xmlns="[^"]*"/g, '');
const forbidden = /https?:\/\/|<image|@import|data:/;
assert(!forbidden.test(stripNs(early)) && !forbidden.test(stripNs(late)), '没有 http/https/<image/@import/data:');
const emoji = [...(early + late)].filter((ch) => {
  const code = ch.codePointAt(0);
  return (code >= 0x1f300 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf) || code === 0xfe0f;
});
assert(emoji.length === 0, '没有 emoji');
const stacks = new Set([...(early + late).matchAll(/font-family="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"')));
assert(stacks.size === 1, '字体栈只有一套');
assert([...stacks][0].includes('"Noto Sans CJK SC"') && [...stacks][0].includes('"Microsoft YaHei"'), '字体栈含中文字体');

// 7. 一条地平线：轨道 + 区间段 + 现在点，且「现在」越界会钳到两头
assert(early.includes('stroke-width="8"') && early.includes('userSpaceOnUse'), '地平线轨道与渐变都在');
const dotX = (svg) => Number((svg.match(/<circle cx="([\d.]+)" cy="(?:474|450)"/) || [])[1]);
const coldSvg = buildWeatherCardSvg({ ...DATA, now: { ...DATA.now, temp: 2 } }, PROFILE, { now: at(8, 0) });
const hotSvg = buildWeatherCardSvg({ ...DATA, now: { ...DATA.now, temp: 40 } }, PROFILE, { now: at(8, 0) });
assert(dotX(coldSvg) === 48, '低于最低温时「现在」钳到左端');
assert(dotX(hotSvg) === 672, '高于最高温时「现在」钳到右端');

// 8. 数据是真的：区间、温差、降雨、空气都来自 data
assert(texts(early).includes('13°') && texts(early).includes('19°'), '区间两端是数据里的最低/最高');
assert(texts(early).includes('6°') && texts(early).includes('96%') && texts(early).includes('83'), '数据带三格来自数据');
assert(early.includes('14°') && early.includes('合肥') && early.includes('多云'), '温度/地点/天气现象都在');

// 9. 降级：缺数据不崩、不吐占位符
const minimal = buildWeatherCardSvg({}, {}, { now: at(8, 0) });
assert(minimal.startsWith('<svg') && !/undefined|NaN/.test(minimal), '空数据也能出图');
assert(!/--/.test(texts(minimal).join('')), '缺数据时不留 -- 占位');
const noRange = buildWeatherCardSvg({ place: '合肥', now: { temp: 10 } }, {}, { now: at(8, 0) });
assert(!noRange.includes('stroke-width="8"'), '没有区间数据就不画地平线');

// 10. 早晚两版的结构差可量化（BRIEF §7.5）
assert(late.includes('明天</text>') && !early.includes('明天</text>'), '晚版多一条「明天」通栏');
assert(!late.includes('明天 9~15°'), '晚版页脚不再重复明日一行');
assert(late.includes('cx="60"') && early.includes('cx="640"'), '光斑圆心早晚不同（位移 ≥300）');
assert(!early.includes('y1="380"') && !late.includes('y1="380"'), '暮线已删（§9.2）');

// 11. 建议区（BRIEF §9.1）：每条单行、≤558px、最多三条、不截断
const adviceOf = (svg) => [...svg.matchAll(/<text x="76"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
const advice = adviceOf(early);
assert(advice.length <= 3, '建议最多三条，实际 ' + advice.length);
assert(advice.every((line) => measureCardText(line, 36) <= CARD_ADVICE_MAX_WIDTH), '每条建议 ≤558px（单行）');
assert(advice.every((line) => !line.endsWith('…')), '不许截断加省略号');
assert(advice.length === 3, '本快照三条都装得下（穿衣 / 带伞 / 口罩）');

// 12. alert（BRIEF §9.3）：降雨不进 alert；AQI ≥ 100 时换竖线颜色，不添线
assert(!early.includes('#FF6F61'), '降雨 96% 不触发 alert');
const badAir = buildWeatherCardSvg({ ...DATA, air: { aqi: 120, pm25: 95 } }, PROFILE, { now: at(8, 0) });
assert(badAir.includes('stroke="#FF6F61"'), 'AQI ≥ 100 时建议竖线换 alert 色');
assert((badAir.match(/#FF6F61/g) || []).length === 1, 'alert 全卡只出现一处');

// 13. 节日并入日期行（BRIEF §9.4）：同一条 text，无节日就整段省略
const dateOf = (svg) => (svg.match(/<text x="48" y="92"[^>]*>([^<]*)<\/text>/) || [])[1];
assert(dateOf(early) === '11 月 3 日 · 周二', '2026-11-03 不是节气，日期行不硬写节日');
const liDong = buildWeatherCardSvg(DATA, PROFILE, { now: new Date(2026, 10, 7, 8, 0) });
assert(dateOf(liDong) === '11 月 7 日 · 周六 · 立冬', '11-07 立冬并进同一条日期行');

// 14. 文本节点预算（BRIEF §9.5）：早 ≤17、晚 ≤18
assert(texts(early).length <= 17, '早版文本节点 ≤17，实际 ' + texts(early).length);
assert(texts(late).length <= 18, '晚版文本节点 ≤18，实际 ' + texts(late).length);

  nodeAssert.equal(total(), 47, '断言总数 47')
})
