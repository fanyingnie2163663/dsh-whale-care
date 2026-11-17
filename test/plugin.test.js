// 接线冒烟：7 个工具都必须注册上，且名字不能变（宿主提示词和 SAFE_EXACT 都按名字认）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, name, inject } from '../lib/index.js'

test('plugin wiring', () => {
  assert.equal(name, 'whale-care')
  assert.deepEqual(inject, ['tools'])
  const registered = []
  apply({ tools: { register: (tool) => registered.push(tool) } })
  assert.deepEqual(registered.map((t) => t.name).sort(), [
    'care_brief',
    'weather',
    'weather_alert',
    'weather_card',
    'weather_care',
    'weather_mood',
    'weather_profile',
    'weather_reminder',
  ])
  for (const tool of registered) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, tool.name + ' 要有像样的描述')
    assert.equal(typeof tool.execute, 'function')
  }
})
