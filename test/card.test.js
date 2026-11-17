import test from 'node:test'
import nodeAssert from 'node:assert/strict'
import { makeChecker } from './harness.js'

// 离线单测：天气卡片的 SVG 内容（不渲染，渲染在服务器集成测试里做）。
import { buildWeatherCardSvg, CARD_SIZE } from '../lib/card.js';

const { ok: assert, total } = makeChecker()

test('card', async () => {
const data = {
  place: '合肥',
  now: { temp: 18, feels: 16, desc: '多云', humidity: 56, uv: 3 },
  air: { aqi: 35, pm25: 12 },
  days: [
    { label: '今天', date: '11-01', min: 14, max: 24, desc: '多云', rain: 20, wind: 12, precip: 0, hours: { h9: 19, h15: 24 }, rainHours: [{ hour: 15, prob: 65 }] },
    { label: '明天', date: '11-02', min: 12, max: 20, desc: '小雨', rain: 80, wind: 18, precip: 3, hours: {} },
  ],
};
const svg = buildWeatherCardSvg(data, { nickname: '老爹', city: '合肥' }, { now: new Date(2026, 10, 1, 9, 0) });
assert(svg.startsWith('<svg'), '输出是 SVG');
assert(svg.includes(`width="${CARD_SIZE.width}"`) && svg.includes(`height="${CARD_SIZE.height}"`), '尺寸 720×980');
assert(svg.includes('合肥'), '包含城市');
assert(svg.includes('18°'), '包含当前温度');
assert(svg.includes('温差') && svg.includes('降雨') && svg.includes('风力') && svg.includes('空气'), '四张信息卡都在');
assert(svg.includes('15 点前后降雨概率 65%'), '逐小时降雨峰值进卡片');
assert(!/undefined|NaN/.test(svg), '没有 undefined / NaN');

const fest = buildWeatherCardSvg(data, { city: '合肥' }, { now: new Date(2026, 10, 7, 9, 0) });
assert(fest.includes('立冬'), '11-07 卡片带立冬');
assert(fest.includes('今天是立冬'), '节日徽章文案完整');

const minimal = buildWeatherCardSvg({}, {}, { now: new Date(2026, 10, 1, 9, 0) });
assert(minimal.startsWith('<svg') && !/undefined|NaN/.test(minimal), '空数据也能出图，不崩');

  nodeAssert.equal(total(), 10, '断言总数 10')
})
