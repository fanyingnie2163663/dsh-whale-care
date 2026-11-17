import test from 'node:test'
import nodeAssert from 'node:assert/strict'
import { makeChecker } from './harness.js'

// 离线单测：残缺/异常天气数据下，各层不能抛错、不能把 undefined 拼进给用户的话。
// 下半段是 lib/weekly.js（周卡数据层）的边界断言：缺数据给 null、少于 7 天、城市超长、
// 用量来源缺失/坏 JSON/快照过期——同一类「别抛错」的问题，就放一个文件了（原因见下方注释）。
//
// 起因：拿 {} 调 buildCareBrief 和 formatDetailed 会直接抛 TypeError；
// 只缺一两个字段时会把 "undefined°C"、"undefined现在" 发出去。天气接口偶尔就是会残缺，
// 尤其是桥接直发路径，抛错会让当天那条关心直接消失。
import { buildCareBrief } from '../lib/care.js';
import { formatDetailed } from '../lib/weather.js';
import { formatAlert } from '../lib/alerts.js';
import { describeReminder } from '../lib/reminders.js';
import * as W from '../lib/weekly.js';
import * as US from '../lib/usage.js';
import { clampDays, dailyAqiFromHourly } from '../lib/openmeteo.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { ok: assert, total } = makeChecker()

test('robustness', async () => {
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

  nodeAssert.equal(total(), 12, '断言总数 12（另有 4 条在 catch 分支里，只在失败时执行）')
})

// ── 周卡数据层（lib/weekly.js）────────────────────────────────────────
// 为什么这份断言塞在 robustness 文件里：本机 16 核 → node --test 默认并发 15；一旦测试
// 文件到第 16 个，Node 24 的 test runner 会稳定报「Unable to deserialize cloned data」
// 并把某个文件（实测 reminders / travel）判成失败——和被测代码无关，串行跑就正常。
// 想正经修的话：package.json 的 test 脚本加 --test-concurrency=12（或用新版 node）。
const week = makeChecker()

test('weekly', async () => {
const at = (y, mo, d, h = 9) => new Date(y, mo - 1, d, h, 0)
// provider 契约里的日槽：date 是 'MM-DD'，min/max/rain 都是数字
const day = (md, max, min, extra = {}) => ({ label: md, date: md, min, max, desc: '晴', rain: 10, wind: 12, precip: 0, hours: {}, ...extra })
  // ── 正常一周：7 天全在周内（周一生成时就是这个形状）──────────────────────
  const now = at(2026, 11, 18) // 周三
  const data = {
    place: '合肥（中国）',
    air: { aqi: 53, pm25: 37.4, dailyAqi: { '2026-11-19': 40, '2026-11-20': 95 } },
    days: [
      day('11-16', 16, 5),
      day('11-17', 18, 6, { aqi: 72 }), // provider 自带 aqi 时优先用自己的
      day('11-18', 21, 9),
      day('11-19', 14, 4),
      day('11-20', 12, 3),
      day('11-21', 15, 2),
      day('11-22', 19, 8),
    ],
  }
  const r = W.buildWeeklyReview({ data, now })
  week.ok(r.week.start === '2026-11-16' && r.week.end === '2026-11-22', `周区间 周一~周日：${r.week.start} ~ ${r.week.end}`)
  week.ok(r.week.number === 47 && r.week.year === 2026, `ISO 第 47 周（实际 ${r.week.number}）`)
  week.ok(r.week.label === '11-16 ~ 11-22' && r.week.dates.length === 7, '周标签 + 7 个日期键')
  week.ok(r.weather.count === 7 && r.weather.days.length === 7, '7 天全给 7 个槽')
  week.ok(r.weather.missingDates.length === 0 && r.weather.weekDays === 7, '周内没有缺口')
  week.ok(r.weather.days[0].date === '2026-11-16' && r.weather.days[0].weekday === '周一', '首槽是周一')
  week.ok(r.weather.days[2].max === 21 && r.weather.days[2].min === 9 && r.weather.days[2].swing === 12, '周三 9~21，温差 12')
  week.ok(r.weather.days[2].desc === '晴' && r.weather.days[2].rain === 10, 'desc / rain 透传')
  week.ok(r.weather.days[1].aqi === 72, 'provider 自带 aqi 优先')
  week.ok(r.weather.days[4].aqi === 95, '没有自带 aqi 时用 air.dailyAqi 的当天最大值')
  week.ok(r.weather.extremes.hottest.value === 21 && r.weather.extremes.hottest.weekday === '周三', '最高温 21 在周三')
  week.ok(r.weather.extremes.coldest.value === 2 && r.weather.extremes.coldest.date === '2026-11-21', '最低温 2 在周六')
  week.ok(r.weather.extremes.biggestSwing.value === 13 && r.weather.extremes.biggestSwing.date === '2026-11-21', '温差最大 13 在周六')
  week.ok(r.weather.extremes.worstAir.value === 95 && r.weather.extremes.worstAir.date === '2026-11-20', '空气最差 95 在周五')
  week.ok(r.air.aqi === 53 && r.air.level === '中等' && r.air.pm25 === 37.4, '当前空气块带等级')
  week.ok(r.city === '合肥（中国）' && r.cityShort === '合肥（中国）', '短城市名不截断')

  // ── 只有 3 天预报：给 3 个槽，缺口照样算出来 ─────────────────────────────
  const short = W.buildWeeklyReview({
    data: { place: '合肥', days: [day('11-18', 21, 9), day('11-19', 14, 4), day('11-20', 12, 3)] },
    now,
  })
  week.ok(short.weather.count === 3 && short.weather.days.length === 3, '只有 3 天就只给 3 个槽')
  week.ok(short.weather.missingDates.length === 4 && short.weather.missingDates.includes('2026-11-16'), '缺的 4 天列进 missingDates')
  week.ok(short.weather.extremes.hottest.value === 21 && short.weather.extremes.coldest.value === 3, '极值只在这 3 天里算')
  week.ok(short.weather.extremes.worstAir === null, '没有 AQI 数据时最差那天是 null')
  week.ok(short.mood.slots.length === 7, '天气只有 3 天，情绪仍是 7 个日槽')

  // ── 无情绪记录 ─────────────────────────────────────────────────────────
  const empty = W.buildWeeklyReview({ data, moods: [], now })
  week.ok(empty.mood.recordedDays === 0 && empty.mood.totalEntries === 0, '没记录：记录天数/条数是 0')
  week.ok(empty.mood.average === null && empty.mood.lowest === null, '没记录：均分和最低那天给 null')
  week.ok(empty.mood.slots.length === 7 && empty.mood.slots.every((s) => s.score === null), '7 个空槽')

  // ── 一天多条：取均值（和 mood.js 的 moodTrend 同口径）────────────────────
  const moods = [
    { date: '2026-11-17', score: 2, at: new Date(2026, 10, 17, 14, 0).getTime(), note: '' },
    { date: '2026-11-17', score: 5, at: new Date(2026, 10, 17, 22, 0).getTime(), note: '加班到九点' },
    { date: '2026-11-18', score: 4, at: new Date(2026, 10, 18, 9, 0).getTime(), note: '早睡' },
  ]
  const m = W.buildWeeklyReview({ data, moods, now }).mood
  const tue = m.slots.find((s) => s.date === '2026-11-17')
  week.ok(tue.score === 3.5 && tue.count === 2, '同一天 2 分 + 5 分取均值 3.5')
  week.ok(tue.note === '加班到九点', '备注取当天最后一条有内容的')
  week.ok(m.recordedDays === 2 && m.totalEntries === 3, '记录了 2 天 / 3 条')
  week.ok(m.average === 3.7, `均分按条数加权（(3.5*2+4)/3≈3.7，实际 ${m.average}）`)
  week.ok(m.lowest.date === '2026-11-17' && m.lowest.score === 3.5, '最低那天是日均 3.5 的周二')
  week.ok(m.from === '2026-11-16' && m.to === '2026-11-18', '情绪窗口标出「本周一 ~ 今天」')
  week.ok(m.slots.find((s) => s.date === '2026-11-19').score === null, '没记的那天是 null')

  // 只有一条时均分就等于它（别出现除零变成 NaN/null）
  const one = W.buildWeeklyReview({ data, moods: [moods[2]], now }).mood
  week.ok(one.average === 4 && one.recordedDays === 1, '只记一天时均分 = 那天')

  // ── 提醒为空 ───────────────────────────────────────────────────────────
  const none = W.buildWeeklyReview({ data, moods, reminders: [], now })
  week.ok(none.reminders.thisWeek.length === 0 && none.reminders.nextWeek.items.length === 0, '没有提醒时两个列表都空')
  week.ok(none.reminders.nextWeek.start === '2026-11-23' && none.reminders.nextWeek.end === '2026-11-29', '下周区间是下一个周一~周日')

  // ── 提醒：这周设过的 / 下周将发生的 ─────────────────────────────────────
  const created = (mo, d) => new Date(2026, mo - 1, d, 10, 0).getTime()
  const reminders = [
    { id: 'a', label: '吃降压药', time: '08:00', intent: 'text', createdAt: created(11, 17) },
    { id: 'b', label: '上周设的', time: '09:00', createdAt: created(11, 10) },
    { id: 'c', label: '每天喝水', time: '15:00', createdAt: created(11, 2) },
    { id: 'd', label: '周一例会', time: '09:30', days: [1], createdAt: created(10, 1) },
    { id: 'e', label: '体检', time: '08:30', date: '2026-11-25', createdAt: created(11, 1) },
    { id: 'f', label: '停用的', time: '10:00', enabled: false, createdAt: created(11, 1) },
  ]
  const rm = W.buildWeeklyReview({ data, now, reminders }).reminders
  week.ok(rm.thisWeek.length === 1 && rm.thisWeek[0].id === 'a', '这周设过的只有 11-17 那条')
  week.ok(rm.thisWeek[0].schedule === '每天' && rm.thisWeek[0].text.includes('08:00'), '带人话时间表')
  // a/c 是每天、b 也是每天（上周设的不影响下周照常发生）、d 每周一、e 一次性
  week.ok(rm.nextWeek.items.map((i) => i.id).join(',') === 'a,e,b,d,c', `下周按时间排 5 条（实际 ${rm.nextWeek.items.map((i) => i.id).join(',')}）`)
  week.ok(rm.nextWeek.items[0].id === 'a' && rm.nextWeek.items[0].count === 7, '每天的排第一且 7 天都发生')
  const meeting = rm.nextWeek.items.find((i) => i.id === 'd')
  week.ok(meeting.dates.length === 1 && meeting.dates[0] === '2026-11-23' && meeting.schedule === '周1', '每周一落在 11-23')
  const body = rm.nextWeek.items.find((i) => i.id === 'e')
  week.ok(body.dates.length === 1 && body.dates[0] === '2026-11-25', '一次性提醒落在 11-25')
  week.ok(!rm.nextWeek.items.some((i) => i.id === 'f'), '停用的提醒不算「将发生」')

  // ── 城市名超长 ─────────────────────────────────────────────────────────
  const longCity = '内蒙古自治区呼伦贝尔市额尔古纳市恩和俄罗斯族民族乡'
  const long = W.buildWeeklyReview({ data: { ...data, place: longCity }, now })
  week.ok(long.city === longCity, 'city 保留原名')
  week.ok([...long.cityShort].length === 12 && long.cityShort.endsWith('…'), `cityShort 截到 12 字（实际 ${long.cityShort}）`)
  const fromProfile = W.buildWeeklyReview({ profile: { city: '合肥', nickname: '老爹' }, now })
  week.ok(fromProfile.city === '合肥' && fromProfile.nickname === '老爹', '没天气数据时城市/称呼从档案兜底')

  // ── 空输入：全 null，不抛错 ─────────────────────────────────────────────
  const blank = W.buildWeeklyReview()
  week.ok(blank.city === null && blank.air === null, '空输入不抛错，城市/空气给 null')
  week.ok(blank.weather.count === 0 && blank.weather.extremes.hottest === null, '没有天气：0 个槽、极值 null')
  week.ok(blank.mood.average === null && blank.mood.slots.length === 7, '没有情绪：7 个空槽')
  week.ok(blank.reminders.thisWeek.length === 0, '没有提醒：空列表')

  // ── 天气槽的容错 ───────────────────────────────────────────────────────
  const odd = W.buildWeeklyReview({
    data: { days: [{ date: '2026-11-18', max: 20, min: 10 }, { max: 99 }, null] },
    now,
  })
  week.ok(odd.weather.count === 1 && odd.weather.days[0].date === '2026-11-18', '完整日期直接可用')
  week.ok(odd.weather.skipped === 2, '没日期的槽和坏数据跳过并计数')

  // ── 跨年周（ISO 年 / 年份靠日期反查，不猜）──────────────────────────────
  const ny = W.buildWeeklyReview({ data: { place: '合肥', days: [day('12-30', 8, -2), day('01-02', 5, -5)] }, now: at(2026, 12, 30) })
  week.ok(ny.week.start === '2026-12-28' && ny.week.end === '2027-01-03', '12-28 ~ 01-03 跨年周')
  week.ok(ny.week.number === 53 && ny.week.year === 2026, '2026 年第 53 周（ISO）')
  week.ok(ny.weather.days[1].date === '2027-01-02' && ny.weather.days[1].weekday === '周六', '跨年周的 01-02 补成 2027 年')

  // ── 天气天数钳制：1~7，默认仍是 3 ───────────────────────────────────────
  week.ok(clampDays(undefined) === 3 && clampDays(0) === 3 && clampDays('abc') === 3, '缺省/非法 → 3')
  week.ok(clampDays(1) === 1 && clampDays(7) === 7 && clampDays('7') === 7, '1 和 7 都能过')
  week.ok(clampDays(9) === 7 && clampDays(-2) === 3, '超过 7 收口到 7')
  week.ok(clampDays(2.7) === 2 && clampDays(undefined, 5) === 5, '取整 + 可指定兜底')

  // ── 逐日 AQI 聚合（hourly european_aqi → 当天最大）──────────────────────
  const daily = dailyAqiFromHourly({
    time: ['2026-11-18T00:00', '2026-11-18T09:00', '2026-11-18T15:00', '2026-11-19T00:00', '2026-11-20T00:00'],
    european_aqi: [53, 63, 41, 12, null],
  })
  week.ok(daily['2026-11-18'] === 63 && daily['2026-11-19'] === 12, '按天取最大')
  week.ok(!('2026-11-20' in daily) && Object.keys(daily).length === 2, 'null 值不当成 0')
  week.ok(Object.keys(dailyAqiFromHourly(undefined)).length === 0, '没有 hourly 就是空对象')

  // ── 本周 token 用量：契约快照优先，账本兜底 ─────────────────────────────
  const home = mkdtempSync(path.join(os.tmpdir(), 'whale-week-usage-'))
  const prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  mkdirSync(path.join(home, 'whale-weather'), { recursive: true })
  const snapFile = path.join(home, 'whale-weather', 'usage.json')
  const ledgerFile = path.join(home, '.dshw-usage.json')
  const writeSnap = (body) => writeFileSync(snapFile, typeof body === 'string' ? body : JSON.stringify(body))
  const writeLedger = (body) => writeFileSync(ledgerFile, typeof body === 'string' ? body : JSON.stringify(body))
  const msOf = (iso) => new Date(iso).getTime()
  const hour = 3600 * 1000

  // 1) 正常：7 天内的契约快照优先，tokens 原样整数
  writeSnap({ version: 1, updatedAt: now.getTime() - hour, source: 'qq-report', week: { tokens: 1770317, cost: 12.3456, turns: 42, from: '2026-11-16', to: '2026-11-22' } })
  writeLedger({ events: [{ day: '2026-11-17', ts: msOf('2026-11-17T10:00:00'), cost: 1, tokens: 5 }] })
  const fresh = await US.loadWeeklyUsage({ now })
  week.ok(fresh.tokens === 1770317, '快照 tokens 原样整数，不四舍五入')
  week.ok(fresh.cost === 12.3456 && fresh.turns === 42, '快照的 cost / turns 透传')
  week.ok(fresh.source === 'qq-report' && fresh.from === '2026-11-16' && fresh.to === '2026-11-22', '快照带 source 和周界')
  week.ok(W.buildWeeklyReview({ data, usage: fresh, now }).usage.tokens === 1770317, '周卡数据里带用量块')

  // 2) 快照过期（>7 天）→ 回退账本，且只算本周
  writeSnap({ version: 1, updatedAt: now.getTime() - 8 * 24 * hour, source: 'qq-report', week: { tokens: 1, cost: 1, turns: 1 } })
  writeLedger({
    date: '2026-11-18',
    history: { '2026-11-16': 0.5 },
    events: [
      { day: '2026-11-16', ts: msOf('2026-11-16T10:00:00'), cost: 0.25, tokens: 100 },
      { day: '2026-11-17', ts: msOf('2026-11-17T10:00:00'), cost: 0.5, tokens: 250 },
      { day: '2026-11-09', ts: msOf('2026-11-09T10:00:00'), cost: 9, tokens: 999 },
    ],
  })
  const stale = await US.loadWeeklyUsage({ now })
  week.ok(stale.source === 'dshw-usage' && stale.from === '2026-11-12' && stale.to === '2026-11-18', '快照过期后回退账本，默认滚动 7 天 D-6…D0')
  week.ok(stale.tokens === 350 && stale.cost === 0.75 && stale.turns === 2, '账本按 events 求和，窗口外那条 999 不算')
  const mondayWin = await US.loadWeeklyUsage({ now, window: 'monday' })
  week.ok(mondayWin.from === '2026-11-16' && mondayWin.to === '2026-11-22' && mondayWin.tokens === 350, 'window=monday 时换成周一~周日，同一份账本')

  // 3) 只有 events、没有 history（且只有 ts 没有 day）→ 用 ts 推本地日期
  writeSnap('not-json')
  writeLedger({ events: [{ ts: msOf('2026-11-18T09:00:00'), cost: 0.1, tokens: 77 }] })
  const eventsOnly = await US.loadWeeklyUsage({ now })
  week.ok(eventsOnly.tokens === 77 && eventsOnly.turns === 1 && eventsOnly.cost === 0.1, '只有 events：按 ts 推日期后求和')

  // 4) 只有 history（没有 events）→ tokens / turns 给 null，花费照给
  writeLedger({ history: { '2026-11-16': 0.3, '2026-11-18': 0.2, '2026-11-01': 9 } })
  const histOnly = await US.loadWeeklyUsage({ now })
  week.ok(histOnly.tokens === null && histOnly.turns === null, '只有 history 时 tokens / turns 给 null')
  week.ok(Math.abs(histOnly.cost - 0.5) < 1e-9, `只有 history 时花费按天求和（实际 ${histOnly.cost}）`)

  // 5) 文件缺失 → null
  rmSync(snapFile, { force: true })
  rmSync(ledgerFile, { force: true })
  week.ok((await US.loadWeeklyUsage({ now })) === null, '两个来源都没有 → null')

  // 6) 坏 JSON → 当没有，不抛错
  writeSnap('{ 坏掉的')
  writeLedger(']not json[')
  week.ok((await US.loadWeeklyUsage({ now })) === null, '坏 JSON 当没有，不抛错')

  rmSync(home, { recursive: true, force: true })
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome

  console.log('\n周卡：第 ' + r.week.number + ' 周 ' + r.week.label
    + ' · 7 天 · 最高 ' + r.weather.extremes.hottest.value + '°（' + r.weather.extremes.hottest.weekday + '）'
    + ' · 最低 ' + r.weather.extremes.coldest.value + '°（' + r.weather.extremes.coldest.weekday + '）'
    + ' · 温差最大 ' + r.weather.extremes.biggestSwing.value + '°（' + r.weather.extremes.biggestSwing.weekday + '）'
    + ' · 空气最差 AQI ' + r.weather.extremes.worstAir.value + '（' + r.weather.extremes.worstAir.weekday + '）')

  nodeAssert.equal(week.total(), 72, '周卡断言总数 72')
})
