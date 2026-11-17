import test from 'node:test'
import nodeAssert from 'node:assert/strict'
import { makeChecker } from './harness.js'

// 离线单测：周卡渲染（lib/card-week.js）+ weather_card 的 period 接线。
// 断言口径直接抄 notes/design/2026-11-18-weekly-card.md 的 §9 验收 6 条 + §8 八组空态。
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const home = mkdtempSync(path.join(os.tmpdir(), 'whale-week-card-'));
process.env.DSH_HOME = home;
mkdirSync(path.join(home, 'whale-weather'), { recursive: true });

const { buildWeeklyReview } = await import('../lib/weekly.js');
const { buildWeeklyCardSvg, formatTokens, formatRange, WEEK_COLUMNS } = await import('../lib/card-week.js');
const { buildWeatherCardSvg, measureCardText } = await import('../lib/card.js');

const { ok: assert, total } = makeChecker()

const at = (y, mo, d, h = 21) => new Date(y, mo - 1, d, h, 0)
const DAY = (md, max, min, extra = {}) => ({ label: md, date: md, min, max, desc: '晴', rain: 0, wind: 10, precip: 0, hours: {}, ...extra })
// 预报从「今天」开始（provider 就是这么给的）：周三生成 = 11-18…11-24；周日生成 = 11-22…11-28
const FORECAST_MIDWEEK = [
  DAY('11-18', 13, 6, { desc: '多云', rain: 36 }), DAY('11-19', 12, 3, { rain: 9 }),
  DAY('11-20', 14, 4, { desc: '小雨', rain: 55 }), DAY('11-21', 15.8, 3.1),
  DAY('11-22', 14.9, 4.6, { desc: '阴', rain: 4 }), DAY('11-23', 14.8, 8.3, { desc: '小雨', rain: 33 }),
  DAY('11-24', 12.3, 1.3, { desc: '阴', rain: 17 }),
]
const FORECAST_SUNDAY = [
  DAY('11-22', 14.9, 4.6, { desc: '阴', rain: 4 }), DAY('11-23', 14.8, 8.3, { rain: 9 }),
  DAY('11-24', 12.3, 1.3, { rain: 0 }), DAY('11-25', 11, 2, { rain: 30 }),
  DAY('11-26', 13, 3, { rain: 0 }), DAY('11-27', 15, 5, { rain: 0 }), DAY('11-28', 16, 6, { rain: 0 }),
]

// 通用口径检查（§9-1 / §9-4 / §9-5）
function checkBudget(svg) {
  const sizes = [...new Set([...svg.matchAll(/font-size="(\d+)"/g)].map((m) => m[1]))];
  assert(sizes.every((s) => s === '28' || s === '44'), '字号只有 28 / 44 两档：' + sizes.join(','));
  const texts = (svg.match(/<text /g) || []).length;
  assert(texts <= 27, '文本节点 ≤27（实际 ' + texts + '）');
  assert((svg.match(/<rect[^>]*fill="(?!none)/g) || []).length === 0, 'fill ≠ none 的 rect = 0');
  assert((svg.match(/<linearGradient/g) || []).length <= 2, '渐变 ≤2');
  assert(!/filter/i.test(svg), 'filter = 0');
  assert(!/undefined|NaN/.test(svg), '没有 undefined / NaN');
  assert(!/N\.A\.|暂无|--|—/.test(svg), '不留占位符');
}

test('weekly card', async () => {
  // ── 正常一周（周三 21:00，第 3 列 = 今天）───────────────────────────────
  const now = at(2026, 11, 18)
  const data = { place: '合肥', air: { aqi: 53, pm25: 37.4 }, days: FORECAST_MIDWEEK }
  const moods = [
    { date: '2026-11-16', score: 3, at: 1 }, { date: '2026-11-17', score: 2, at: 2 },
    { date: '2026-11-17', score: 4, at: 3 }, { date: '2026-11-18', score: 2, at: 4 },
  ]
  const reminders = [
    { id: 'a', label: '吃降压药', time: '08:00', intent: 'text', enabled: true, createdAt: 1 },
    { id: 'c', label: '体检', time: '08:30', intent: 'text', date: '2026-11-20', enabled: true, createdAt: 1 },
  ]
  const usage = { tokens: 1234567, cost: 12.5, turns: 42, from: '2026-11-16', to: '2026-11-22', source: 'x' }
  const review = buildWeeklyReview({ data, moods, reminders, usage, now })
  const svg = buildWeeklyCardSvg(review, {}, { now, reminders })
  const svg2 = buildWeeklyCardSvg(review, {}, { now, reminders })

  assert(svg === svg2, '同一份入参两遍渲染逐字节一致')
  assert(svg.startsWith('<svg') && svg.endsWith('</svg>'), '是一个完整 SVG')
  checkBudget(svg)
  assert(svg.includes('第 47 周') && svg.includes('11 月 16 – 22 日'), '头：第 47 周 + 本周区间')
  // 规格 v1.1 的新区带（159 行）：头 40–124 / 导语 148–256 / 温度 280–508 / 情绪 532–692 / 事实 716–792 / 提醒 816–892
  assert(svg.includes('<text x="48" y="66"') && svg.includes('<text x="48" y="116"'), '头两行基线 66 / 116')
  assert(svg.includes('<text x="76" y="190"') && svg.includes('<text x="76" y="245"'), '导语基线 190 / 245（行距 55）')
  assert(svg.includes('y1="388" x2="672" y2="388"'), '温度带中线在 388（= 300/476 中点）')
  assert(svg.includes('<text x="48" y="744"') && svg.includes('y="788"'), '事实带标签 @744 / 值 @788')
  assert(svg.includes('<text x="68" y="840"') && svg.includes('<text x="68" y="872"'), '提醒基线 840 / 872')
  assert(svg.includes('y1="610"') && svg.includes('<text x="48" y="940"'), '情绪中性基线 610 / 脚 940')
  // 7 列 = 周一…周日；今天在第 3 列，两张图同一个 x（§9-2）
  const todayLabels = [...svg.matchAll(/<text x="([\d.]+)" y="(504|692)"[^>]*>今天<\/text>/g)];
  assert(todayLabels.length === 2 && todayLabels.every((m) => Number(m[1]) === WEEK_COLUMNS[2]), '两张图的「今天」都在第 3 列 x≈270.9')
  // 温度带只画今天→周日：周一 / 周二两列没有点（那是过去的预报，不存在）
  const circleOf = (source) => [...source.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }));
  const tempDots = circleOf(svg).filter((c) => c.cy >= 300 && c.cy <= 476);
  assert(!tempDots.some((c) => c.cx === WEEK_COLUMNS[0] || c.cx === WEEK_COLUMNS[1]), '周一/周二不画温度点')
  assert(tempDots.some((c) => c.cx === WEEK_COLUMNS[2] && c.r === 4.5), '今天（第 3 列）的点更大：9px')
  // 情绪线只画周一→今天：周四之后没有点、也没有空心圈
  assert(!circleOf(svg).some((c) => c.cy >= 532 && c.cx === WEEK_COLUMNS[3]), '周四（未来）不画情绪点')
  // 情绪最低那天 avg=2 → 导语走第 2 条（16 当量，按 572 宽度折成两行）
  assert(svg.includes('周三 那天不太好，') && svg.includes('其他几天还行。'), '导语用第 2 条（折两行，行首不出标点）')
  assert(svg.includes('最暖 周六 16°') || (svg.includes('最暖') && svg.includes('周六 16°')), '事实左：最暖 周六 16°')
  assert(svg.includes('情绪最低') && svg.includes('周三 2'), '事实中：情绪最低 周三 2')
  assert(svg.includes('本周 Token') && svg.includes('1.2M'), '事实右：1.2M（§10 格式）')
  assert(svg.includes('08:30 11 月 20 日 · 体检'), '提醒行：时间 + 时间表 + 内容')
  assert(svg.includes('08:00 每天 · 吃降压药'), '提醒行：每天')
  // 雨标只在有雨的天（周五 rain=55）
  const rainMarks = [...svg.matchAll(/<line x1="([\d.]+)" y1="508"/g)].map((m) => Number(m[1]));
  assert(rainMarks.length === 3 && rainMarks.every((x) => x > WEEK_COLUMNS[3] && x < WEEK_COLUMNS[5]), '只有周五有 3 条雨标')

  // 导语第 5 条：没有 ≤2 分的日子、温差 <8、雨日 <3 → 记了 N 次 / 平均 X 分
  const calm = buildWeeklyCardSvg(
    buildWeeklyReview({
      data: { ...data, days: FORECAST_MIDWEEK.map((d) => ({ ...d, min: 10, max: 14, rain: 0 })) },
      moods: [{ date: '2026-11-16', score: 4, at: 1 }, { date: '2026-11-18', score: 5, at: 2 }],
      now,
    }),
    {}, { now },
  )
  assert(calm.includes('这周记了 2 次') && calm.includes('4.5 分'), '导语用第 5 条：记了 2 次，平均 4.5 分')

  // ── 邻窗不串味：预报伸到下周时，事实带的「最暖」必须还在本周 ──────────────
  const neighbor = buildWeeklyCardSvg(
    buildWeeklyReview({
      data: { ...data, days: [...FORECAST_MIDWEEK.slice(0, 5), DAY('11-23', 20, 9), DAY('11-24', 22, 11)] },
      now,
    }),
    {}, { now },
  )
  assert(neighbor.includes('周六 16°') && !neighbor.includes('20°') && !neighbor.includes('22°'), '最暖不取下周的温度（20/22 不该出现）')

  // 周日生成：本周只剩今天 1 天 → 温度带退化区间条，事实最暖是今天
  const sundayOnly = buildWeeklyCardSvg(
    buildWeeklyReview({ data: { ...data, days: [DAY('11-22', 14.9, 4.6), DAY('11-25', 20, 9)] }, now: at(2026, 11, 22) }),
    {}, { now: at(2026, 11, 22) },
  )
  assert(sundayOnly.includes('15°') && !sundayOnly.includes('20°'), '周日生成：最暖是今天的 14.9→15°，不是下周的 20°')

  // ── 空态 1：无情绪 ────────────────────────────────────────────────
  const noMood = buildWeeklyCardSvg(buildWeeklyReview({ data, now }), {}, { now })
  assert((noMood.match(/这周还没有记录/g) || []).length === 1, '无情绪：「这周还没有记录」恰好 1 次')
  assert(!/<circle[^>]*r="6"[^>]*fill="none"/.test(noMood), '无情绪：不画空心圈')
  assert(noMood.includes('这周没写，也没关系。'), '无情绪：导语走规则 1')
  assert(!noMood.includes('本周 Token'), '没有 usage 时整格省略（事实带 2 栏）')

  // ── 空态 2：情绪只有部分天（周一/周二 + 周四/周五，今天=周日）────────────
  const sunday = at(2026, 11, 22)
  const gapMoods = [
    { date: '2026-11-16', score: 4, at: 1 }, { date: '2026-11-17', score: 3, at: 2 },
    { date: '2026-11-19', score: 2, at: 3 }, { date: '2026-11-20', score: 5, at: 4 },
  ]
  const sundayData = { ...data, days: FORECAST_SUNDAY }
  const gapSvg = buildWeeklyCardSvg(buildWeeklyReview({ data: sundayData, moods: gapMoods, now: sunday }), {}, { now: sunday })
  const filled = [...gapSvg.matchAll(/<circle[^>]*r="6"[^>]*fill="#6FD3F2"/g)].length
  const hollow = [...gapSvg.matchAll(/<circle[^>]*r="6"[^>]*fill="none"/g)].length
  assert(filled === 4, '4 个实心情绪点（实际 ' + filled + '）')
  assert(hollow === 3, '周三/周六/周日 3 个空心圈（实际 ' + hollow + '）')
  const moodLines = [...gapSvg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#6FD3F2"/g)];
  assert(moodLines.length === 2, '2 段折线（缺口不连）');
  assert(!moodLines.some((m) => Number(m[1]) === WEEK_COLUMNS[1] && Number(m[3]) === WEEK_COLUMNS[3]), '周二到周四之间不得有连线')

  // ── 空态 3：无提醒 ────────────────────────────────────────────────
  const noRemind = buildWeeklyCardSvg(buildWeeklyReview({ data, now }), {}, { now, reminders: [] })
  assert(!noRemind.includes('吃降压药') && !noRemind.includes('没有提醒'), '无提醒：整区留空，不写「没有提醒」')
  assert(!/<circle cx="48" cy="82\d"/.test(noRemind), '无提醒：不画圆点')
  assert(noRemind.includes('小鲸鱼关心'), '脚照旧')

  // ── 空态 4：无 usage → 事实带 2 栏 x=48/360 ────────────────────────
  const twoCol = buildWeeklyCardSvg(buildWeeklyReview({ data, moods, now }), {}, { now })
  const factXs = [...twoCol.matchAll(/<text x="([\d.]+)" y="744"/g)].map((m) => Number(m[1]));
  assert(factXs.join(',') === '48,360', '2 栏时 x = 48 / 360（实际 ' + factXs.join(',') + '）')
  assert(!twoCol.includes('本周 Token'), '2 栏时没有 token 格')

  // ── 空态 5：只有 3 天预报 → 区间条 ─────────────────────────────────
  const few = buildWeeklyCardSvg(buildWeeklyReview({ data: { ...data, days: FORECAST_MIDWEEK.slice(0, 3) }, now }), {}, { now })
  assert(few.includes('week-range') && few.includes('stroke-width="8"'), '≤3 天：退化成 8px 区间条（cool→warm）')
  assert(!few.includes('<polyline'), '≤3 天：不画 7 列折线')
  assert((few.match(/y="504"/g) || []).length === 2, '≤3 天：温度日标不画，只留两端值')

  // ── 空态 6：同温 ──────────────────────────────────────────────────
  const flat = buildWeeklyCardSvg(buildWeeklyReview({ data: { ...data, days: FORECAST_MIDWEEK.map((d) => ({ ...d, min: 12, max: 12 })) }, now }), {}, { now })
  assert(!flat.includes('fill-opacity="0.08"'), '同温：不画 8% 填充（面积为零）')
  assert((flat.match(/stroke="#6FD3F2" stroke-width="3"/g) || []).length === 0, '同温：只画 warm 一条 3px')

  // ── 空态 7：长城市名 → 14 全角当量 + … ─────────────────────────────
  const longCity = '内蒙古自治区呼伦贝尔市额尔古纳市恩和俄罗斯族民族乡'
  const longSvg = buildWeeklyCardSvg(buildWeeklyReview({ data: { ...data, place: longCity }, now }), {}, { now })
  const head = /<text x="48" y="66"[^>]*>([^<]*)<\/text>/.exec(longSvg)?.[1] ?? ''
  assert(head.endsWith('…'), '长城市名截断加省略号（' + head + '）')
  assert(measureCardText(head, 28) <= 588, '头行 ≤588px（' + Math.round(measureCardText(head, 28)) + 'px）')

  // ── 空态 8：全空 ──────────────────────────────────────────────────
  const blank = buildWeeklyCardSvg(buildWeeklyReview({ now }), {}, { now })
  checkBudget(blank)
  assert(blank.includes('没有拿到这周的预报') && blank.includes('这周还没有记录'), '全空：两条空态文案都在')
  assert(blank.includes('这里'), '没有城市时写「这里」，不瞎猜城市')

  // ── 跨年周（§8.7）─────────────────────────────────────────────────
  assert(formatRange('2026-12-28', '2027-01-03') === '12 月 29 – 1 月 4 日'.replace('29', '28').replace('4 日', '3 日'), '跨年周两侧都写月份')
  const nySvg = buildWeeklyCardSvg(buildWeeklyReview({ data: { ...data, days: [DAY('12-30', 8, -2)] }, now: at(2026, 12, 30) }), {}, { now: at(2026, 12, 30) })
  assert(nySvg.includes('第 53 周') && nySvg.includes('12 月 28 – 1 月 3 日'), '跨年周：ISO 第 53 周 + 跨月区间')

  // ── §10 token 三档 ────────────────────────────────────────────────
  assert(formatTokens(843) === '843' && formatTokens(0) === '0', '<1000 写整数')
  assert(formatTokens(12345) === '12.3K', '12.3K')
  assert(formatTokens(1234567) === '1.2M', '1.2M')
  assert(formatTokens(123456789) === '123M', 'n≥100 取整：123M')
  assert(formatTokens(null) === null, '没有值是 null，不写 —')

  // ── 接线：period=day / week（stub 天气源，不联网）────────────────────
  const { registerProvider } = await import('../lib/providers.js');
  registerProvider('stub', async (city) => ({
    place: city, now: { temp: 13.8, feels: 12.9, desc: '多云', humidity: 78, uv: 2, wind: 18 },
    air: { aqi: 83, pm25: 62 }, days: FORECAST_MIDWEEK.map((d) => ({ ...d, wind: 10 })),
  }));
  process.env.DSH_WEATHER_PROVIDER = 'stub';
  const toolBox = { register: (tool) => { toolBox.tool = tool; } };
  const { register } = await import('../lib/tools/card.js');
  register({ tools: toolBox });
  const tool = toolBox.tool;
  assert(tool.name === 'weather_card', '工具名不变');
  assert(tool.parameters.properties.period.enum.join('/') === 'day/week', 'period 只有 day / week');
  // 默认源（stub 只给 3 天）→ 周卡路径应自己再试一次 open-meteo，拿到 7 天
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes('geocoding-api')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 31.86, longitude: 117.28, name: '芜湖', country: '中国' }] }) };
    }
    if (text.includes('air-quality')) return { ok: false, status: 503, json: async () => ({}) };
    if (text.includes('api.open-meteo.com')) {
      const dates = ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
      const hours = [];
      for (const date of dates) for (let h = 0; h < 24; h += 1) hours.push(date + 'T' + String(h).padStart(2, '0') + ':00');
      const zeros = hours.map(() => 0);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          daily: {
            time: dates,
            temperature_2m_max: dates.map(() => 15),
            temperature_2m_min: dates.map(() => 5),
            weather_code: dates.map(() => 0),
            precipitation_probability_max: dates.map(() => 0),
            precipitation_sum: dates.map(() => 0),
            wind_speed_10m_max: dates.map(() => 10),
          },
          hourly: { time: hours, temperature_2m: zeros, precipitation_probability: zeros, precipitation: zeros, weather_code: zeros },
          current: { temperature_2m: 13, apparent_temperature: 12, relative_humidity_2m: 60, weather_code: 0, wind_speed_10m: 10, uv_index: 2 },
        }),
      };
    }
    throw new Error('不该请求：' + text);
  };
  const dayOut = await tool.execute({ city: '芜湖' });
  const fallbackOut = await tool.execute({ city: '芜湖', period: 'week' });
  globalThis.fetch = realFetch;
  const dayFile = dayOut.text.match(/：(.+?\.svg)/)[1];
  const weekFile = fallbackOut.text.match(/：(.+?\.svg)/)[1];
  assert(existsSync(dayFile) && existsSync(weekFile), '两张卡都落盘了');
  const daySvg = readFileSync(dayFile, 'utf8');
  const weekSvg = readFileSync(weekFile, 'utf8');
  assert(daySvg.includes('现在') === false && daySvg.includes('°') && !daySvg.includes('第 47 周'), 'period 默认仍是日卡');
  assert(weekSvg.includes('第 47 周') && weekSvg.includes('本周 Token') === false, 'period=week 走周卡（stub 没用量 → 无 token 格）');
  assert(weekSvg.includes('<polyline') && weekSvg.includes('周四'), '源只给 3 天时周卡自动补 open-meteo，画出了温度带折线（没退化成区间条）');
  delete process.env.DSH_WEATHER_PROVIDER;

  // ── 日卡逐字节不变（重构前抓的三个 sha）──────────────────────────────
  const sampleData = {
    place: '合肥',
    now: { temp: 13.8, feels: 12.9, desc: '多云', humidity: 78, uv: 2, wind: 18 },
    air: { aqi: 83, pm25: 62 },
    days: [
      { label: '今天', date: '11-03', min: 13.2, max: 19, desc: '多云', rain: 96, wind: 18, precip: 0, hours: {} },
      { label: '明天', date: '11-04', min: 9, max: 15, desc: '阴', rain: 100, wind: 24, precip: 2, hours: {} },
    ],
  }
  const sampleProfile = { city: '合肥', nickname: '阿宁', coldSensitive: true, commute: 'bike', notes: '有鼻炎' }
  const sha = (value) => createHash('sha256').update(value).digest('hex')
  const evening = buildWeatherCardSvg(sampleData, sampleProfile, { now: at(2026, 11, 3, 20) })
  const morning = buildWeatherCardSvg(sampleData, sampleProfile, { now: at(2026, 11, 3, 8) })
  const light = buildWeatherCardSvg(sampleData, sampleProfile, { now: at(2026, 11, 3, 20), theme: 'light' })
  assert(sha(evening) === 'c2bc92b406c5a8134f78c9e2c09f6c9222fedba745495cb0ea13c1d0571ff335', '日卡晚版逐字节不变')
  assert(sha(morning) === '4b477054a074d3cfcd5d78e183ecc89f1bb52b7821b19162c4eeb9b5582401ee', '日卡早版逐字节不变')
  assert(sha(light) === '7e2e1f86343917ab4178c0c4932bead12e3530f3161a265f95efabd1700d553b', '日卡浅色版逐字节不变')

  rmSync(home, { recursive: true, force: true })
  delete process.env.DSH_HOME

  nodeAssert.equal(total(), 75, '断言总数 75')
})
