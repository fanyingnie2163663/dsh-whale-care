// 说话层与 care_brief：只验「选中的说没说、没选中的有没有多嘴」。
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderBrief } from '../lib/engine/voice.js'

test('voice: 一条信号带动作', () => {
  const text = renderBrief({ signals: [{ text: '今天降雨概率 82%', hint: '带伞' }], profile: { nickname: '阿宁' } })
  assert.equal(text, '阿宁，今天降雨概率 82%，带伞。')
})

test('voice: 多条用分号串起来', () => {
  const text = renderBrief({
    signals: [{ text: '今天降雨概率 82%', hint: '带伞' }, { text: '早晚温差 11°C', hint: '加一件' }],
    profile: {},
  })
  assert.equal(text, '今天降雨概率 82%，带伞；早晚温差 11°C，加一件。')
})

test('voice: 提醒单独成句', () => {
  const text = renderBrief({ signals: [], profile: {}, extras: [{ time: '09:00', label: '妈妈生日' }] })
  assert.equal(text, '另外：09:00 妈妈生日。')
})

test('voice: 没东西可说就不说', () => {
  assert.equal(renderBrief({ signals: [], profile: {}, extras: [] }), '')
})
