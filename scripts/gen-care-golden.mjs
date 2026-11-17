// 本地工具：把当前的话术冻成 fixture。改文案后跑一次，diff 就是这次改动的全部影响。
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildCareBrief } from '../lib/care.js'
import { scenarios } from '../test/fixtures/care-scenarios.js'

const golden = scenarios.map((s) => ({ name: s.name, text: buildCareBrief(s.data, s.profile, s.opts) }))
const file = path.join(process.cwd(), 'test', 'fixtures', 'care-golden.json')
writeFileSync(file, JSON.stringify(golden, null, 2) + '\n')
console.log('wrote', golden.length, 'scenarios ->', file)
