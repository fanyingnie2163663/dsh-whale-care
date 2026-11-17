// 行为冻结：换引擎、改文案都不许悄悄改变输出。改文案要同时改 fixture 并在提交里说明。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildCareBrief } from '../lib/care.js'
import { scenarios } from './fixtures/care-scenarios.js'

const golden = JSON.parse(readFileSync(new URL('./fixtures/care-golden.json', import.meta.url), 'utf8'))

test('care golden', () => {
  assert.equal(golden.length, scenarios.length, '场景数与 fixture 一致')
  for (const [i, s] of scenarios.entries()) {
    assert.equal(golden[i].name, s.name)
    assert.equal(buildCareBrief(s.data, s.profile, s.opts), golden[i].text, s.name + ' 输出变了')
  }
})
