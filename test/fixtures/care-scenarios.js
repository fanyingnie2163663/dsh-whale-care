// 关心版话术的冻结场景：新增/改文案时先改这里，再重新生成 care-golden.json。
// 时间全部写死，避免跑测试的那天影响节日/时段。

const day = (label, date, min, max, desc, rain, wind, hours) => ({ label, date, min, max, desc, rain, wind, precip: 0, hours });

export const scenarios = [
  {
    name: '早高峰带雨骑车怕冷',
    data: {
      place: '合肥',
      now: { temp: 16, feels: 14, desc: '小雨', humidity: 78, uv: 2, wind: 18 },
      air: { aqi: 62, pm25: 45 },
      days: [day('今天', '11-17', 14, 19, '小雨', 82, 20, { h9: 15, h15: 19, h21: 16 }), day('明天', '11-18', 9, 15, '阴', 20, 26, { h9: 11, h15: 15, h21: 10 })],
    },
    profile: { city: '合肥', nickname: '阿宁', coldSensitive: true, commute: 'bike', hasUmbrella: false, notes: '有鼻炎' },
    opts: { now: new Date(2026, 10, 17, 7, 30) },
  },
  {
    name: '晚上预告明天降温',
    data: {
      place: '合肥',
      now: { temp: 9, feels: 6, desc: '多云', humidity: 55, uv: 0, wind: 12 },
      air: { aqi: 35, pm25: 20 },
      days: [day('今天', '11-17', 6, 12, '多云', 5, 14, { h9: 8, h15: 12, h21: 7 }), day('明天', '11-18', 0, 6, '小雪', 60, 30, { h9: 1, h15: 6, h21: 0 })],
    },
    profile: { city: '合肥', nickname: '阿宁', heatSensitive: false },
    opts: { now: new Date(2026, 10, 17, 21, 10) },
  },
  {
    name: '出差上海加生日提醒',
    data: {
      place: '上海',
      now: { temp: 22, feels: 23, desc: '晴', humidity: 60, uv: 6, wind: 10 },
      air: { aqi: 88, pm25: 66 },
      days: [day('今天', '11-17', 18, 24, '晴', 0, 12, { h9: 20, h15: 24, h21: 19 }), day('明天', '11-18', 17, 23, '多云', 10, 14, { h9: 19, h15: 23, h21: 18 })],
    },
    profile: { city: '合肥', travelCity: '上海', travelUntil: '2026-11-18', nickname: '阿宁' },
    opts: { now: new Date(2026, 10, 17, 9, 0), reminders: [{ time: '09:00', label: '妈妈生日' }] },
  },
  {
    name: '残缺数据不崩',
    data: {},
    profile: {},
    opts: { now: new Date(2026, 10, 17, 12, 0), festival: false },
  },
  {
    name: '高温加空气差',
    data: {
      place: '合肥',
      now: { temp: 36, feels: 39, desc: '晴', humidity: 40, uv: 9, wind: 6 },
      air: { aqi: 156, pm25: 120 },
      days: [day('今天', '11-17', 29, 37, '晴', 0, 8, { h9: 33, h15: 37, h21: 31 }), day('明天', '11-18', 28, 36, '晴', 0, 9, { h9: 32, h15: 36, h21: 30 })],
    },
    profile: { city: '合肥', nickname: '阿宁', heatSensitive: true, commute: 'transit' },
    opts: { now: new Date(2026, 10, 17, 14, 0) },
  },
  {
    name: '无档案默认话术',
    data: {
      place: '合肥',
      now: { temp: 20, feels: 20, desc: '多云', humidity: 50, uv: 3, wind: 8 },
      air: { aqi: 45, pm25: 30 },
      days: [day('今天', '11-17', 13, 22, '多云', 10, 12, { h9: 17, h15: 22, h21: 18 }), day('明天', '11-18', 12, 21, '阴', 15, 13, { h9: 16, h15: 21, h21: 17 })],
    },
    profile: {},
    opts: { now: new Date(2026, 10, 17, 10, 0), festival: false },
  },
];
