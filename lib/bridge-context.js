// 桥接上下文：qq-bridge 会把「它对这个人的了解」定期写成一个只读快照，
// 插件读过来当参考（比如聊天里说过"平时骑车上班""有鼻炎"，就不用再问一遍）。
//
// 契约（由 qq-bridge 写，插件只读）：
//   $DSH_HOME/whale-weather/user-context.json
//   { "version": 1, "updatedAt": <ms>, "source": "qq-bridge",
//     "user": { "qq": "741934896", "displayName": "…",
//               "traits": ["…"], "interactionCount": 3, "lastSeenAt": <ms> } }
//
// 规则：快照超过 7 天视为过期；偏好档案（profile.json）里的值永远优先，
// 快照只补空缺、不覆盖用户亲手设过的字段。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function bridgeContextPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'user-context.json');
}

/** 读桥接写的快照；没有、损坏、过期都返回 null。 */
export async function loadBridgeContext() {
  try {
    const raw = await readFile(bridgeContextPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.updatedAt || Date.now() - Number(parsed.updatedAt) > MAX_AGE_MS) return null;
    return parsed.user ?? null;
  } catch {
    return null;
  }
}

/** 从自由文本的印象里提取能落到偏好字段的线索；没有把握的就不猜。 */
export function hintsFromContext(user) {
  const traits = Array.isArray(user?.traits) ? user.traits.filter((t) => typeof t === 'string' && t.trim()) : [];
  const text = traits.join('；');
  const hints = { displayName: user?.displayName || '', traits, interactionCount: Number(user?.interactionCount) || 0 };

  if (/骑车|自行车|电动车|摩托/.test(text)) hints.commute = 'bike';
  else if (/步行|走路|走着去/.test(text)) hints.commute = 'walk';
  else if (/公交|地铁|坐车/.test(text)) hints.commute = 'transit';
  else if (/开车|自驾/.test(text)) hints.commute = 'drive';

  if (/怕冷|手脚冰|体寒/.test(text)) hints.coldSensitive = true;
  if (/怕热|怕闷/.test(text)) hints.heatSensitive = true;

  const health = traits.filter((t) => /鼻|咽|哮喘|过敏|偏头痛|头疼|颈椎|胃/.test(t));
  if (health.length) hints.notes = health.join('；').slice(0, 160);

  return hints;
}

/** 合并：profile 优先，快照只补空缺。 */
export function mergeHints(profile = {}, hints = {}) {
  const out = { ...profile };
  if (hints.commute && !out.commute) out.commute = hints.commute;
  if (hints.coldSensitive && out.coldSensitive === undefined) out.coldSensitive = true;
  if (hints.heatSensitive && out.heatSensitive === undefined) out.heatSensitive = true;
  if (hints.notes && !out.notes) out.notes = hints.notes;
  if (hints.traits?.length || hints.displayName) out.bridgeHints = hints;
  return out;
}
