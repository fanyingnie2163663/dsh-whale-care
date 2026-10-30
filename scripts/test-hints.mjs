// 离线单测：可选的「用户上下文」快照 → 偏好档案的合并逻辑。
//
// 别的插件（比如 qq-bridge）可以把对这个人的印象写进
// $DSH_HOME/whale-weather/user-context.json，插件只读它，用来补 profile.json 里
// 没填的出行方式 / 怕冷怕热 / 健康备注。**没有这个文件也必须完全正常**。
// 约定：用户亲手设过的字段永远优先；快照过期或不合法就当没有。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hintsFromContext, mergeHints, loadUserContext } from '../lib/user-context.js';
import { effectiveProfile, describeProfile, loadProfile } from '../lib/profile.js';

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

// 每个用例一个临时 DSH_HOME
const homes = [];
function makeHome(userContext) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'whale-care-hint-'));
  homes.push(dir);
  mkdirSync(path.join(dir, 'whale-weather'), { recursive: true });
  if (userContext !== undefined) {
    const file = path.join(dir, 'whale-weather', 'user-context.json');
    writeFileSync(file, typeof userContext === 'string' ? userContext : JSON.stringify(userContext), { mode: 0o600 });
  }
  process.env.DSH_HOME = dir;
  return dir;
}

const ctx = (traits, extra = {}) => ({
  version: 1,
  updatedAt: Date.now(),
  source: 'qq-bridge',
  user: { qq: '741934896', displayName: 'DDDeSt1ny', traits, interactionCount: 3, lastSeenAt: Date.now() - 3600_000, ...extra },
});

// ── 从自由文本提取线索 ─────────────────────────────────────────
let h = hintsFromContext(ctx(['平时骑车上班', '有鼻炎，空气差会难受']).user);
assert(h.commute === 'bike', '「骑车上班」→ 出行方式 bike');
assert(/鼻炎/.test(h.notes || ''), '健康类印象 → notes');
assert(h.displayName === 'DDDeSt1ny', '带出 QQ 昵称');

h = hintsFromContext(ctx(['我怕冷', '每天走路去地铁站']).user);
assert(h.commute === 'walk', '「走路」优先于「地铁」');
assert(h.coldSensitive === true, '「怕冷」→ coldSensitive');

h = hintsFromContext(ctx(['今天天气不错']).user);
assert(!h.commute && !h.notes && !h.coldSensitive, '无关印象不瞎猜');

// ── 合并规则：profile 优先 ─────────────────────────────────────
const merged = mergeHints({ city: '合肥', commute: 'transit' }, { commute: 'bike', coldSensitive: true, notes: '有鼻炎' });
assert(merged.commute === 'transit', '用户设过的 commute 不被覆盖');
assert(merged.coldSensitive === true, '空缺的 coldSensitive 被补上');
assert(merged.notes === '有鼻炎', '空缺的 notes 被补上');

const kept = mergeHints({ notes: '我自己的备注' }, hintsFromContext(ctx(['有鼻炎']).user));
assert(kept.notes === '我自己的备注', 'notes 不被覆盖');

// ── effectiveProfile 读取真实文件 ──────────────────────────────
makeHome(ctx(['平时开车', '怕热']));
const eff = await effectiveProfile();
assert(eff.commute === 'drive' && eff.heatSensitive === true, 'effectiveProfile 合并快照');

// 快照过期（8 天前）→ 忽略
makeHome({ ...ctx(['平时开车']), updatedAt: Date.now() - 8 * 24 * 3600 * 1000 });
const stale = await effectiveProfile();
assert(!stale.commute, '过期快照不生效');

// 坏 JSON → 忽略且不抛错
makeHome('{ not json');
let bad = null;
try { bad = await effectiveProfile(); } catch (e) { assert(false, `坏 JSON 抛错：${e.message}`); }
assert(bad && !bad.commute, '坏 JSON 被忽略');

// 没有快照文件 → 空 profile
makeHome(undefined);
const none = await effectiveProfile();
assert(Object.keys(none).length === 0, '没有快照时返回空 profile');
assert((await loadUserContext()) === null, '没有快照文件时 loadUserContext 返回 null');

// 关键：宿主插件缺席时必须完全照旧——这只是多一个来源，不是依赖
const homeNoCtx = makeHome(undefined);
writeFileSync(path.join(homeNoCtx, 'whale-weather', 'profile.json'), JSON.stringify({ city: '合肥', nickname: '老爹', commute: 'walk' }), { mode: 0o600 });
const [effNoCtx, rawNoCtx] = await Promise.all([effectiveProfile(), loadProfile()]);
assert(JSON.stringify(effNoCtx) === JSON.stringify(rawNoCtx), '没有上下文文件时 effectiveProfile 与 loadProfile 完全一致');

// ── 展示 ──────────────────────────────────────────────────────
const desc = describeProfile(mergeHints({ nickname: '老爹' }, hintsFromContext(ctx(['有鼻炎']).user)));
assert(desc.includes('印象'), 'describeProfile 会展示来自其他插件的印象');

// 清理
for (const dir of homes) { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
delete process.env.DSH_HOME;
