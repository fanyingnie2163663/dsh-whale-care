// 日历传感器：节日信号，以及没有节日时不出声。
import test from 'node:test'
import assert from 'node:assert/strict'
import { collectCalendarSignals } from '../lib/engine/sensors/calendar.js'

test('calendar: 元旦给一条节日信号', () => {
  const signals = collectCalendarSignals({ now: new Date(2026, 0, 1, 9, 0) })
  assert.equal(signals.length, 1)
  assert.equal(signals[0].topic, 'calendar')
  assert.match(signals[0].text, /元旦/)
  assert.ok(signals[0].weight >= 50)
})

test('calendar: 普通日子不出声', () => {
  const signals = collectCalendarSignals({ now: new Date(2026, 2, 15, 9, 0) })
  assert.deepEqual(signals, [])
})
