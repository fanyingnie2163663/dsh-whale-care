// 传感器与判断层：只验证「哪些信号会被收上来、谁排在前面」。
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectWeatherSignals } from '../lib/engine/sensors/weather.js'
import { judge } from '../lib/engine/judge.js'

const data = {
  place: '合肥',
  now: { temp: 8, humidity: 25 },
  air: { aqi: 160 },
  days: [
    { label: '今天', min: 1, max: 12, rain: 80, wind: 34, hours: { h15: 9 } },
    { label: '明天', min: -3, max: 5, rain: 10, wind: 12 },
  ],
};

test('sensor: 信号来自数据，不编造', () => {
  const topics = collectWeatherSignals(data, { coldSensitive: true }).map((s) => s.topic).sort()
  assert.deepEqual(topics, ['air', 'aqi', 'cold', 'dry', 'rain', 'swing', 'temp-drop', 'wind'].filter((t) => t !== 'air').sort())
})

test('judge: 去重、排序、限量', () => {
  const signals = [
    { topic: 'rain', weight: 80 },
    { topic: 'rain', weight: 60 },
    { topic: 'wind', weight: 50 },
    { topic: 'dry', weight: 20 },
    { topic: 'uv', weight: 10 },
  ]
  const result = judge(signals, { limit: 2 })
  assert.deepEqual(result.chosen.map((s) => s.topic), ['rain', 'wind'])
  assert.equal(result.chosen[0].weight, 80)
  assert.equal(result.rest.length, 2)
})

test('judge: 必须说的事不被挤掉', () => {
  const med = { topic: 'med', weight: 0, hint: '吃药' }
  const result = judge([{ topic: 'rain', weight: 90 }], { limit: 0, must: [med] })
  assert.deepEqual(result.chosen, [med])
})
