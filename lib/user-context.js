// 用户上下文（可选能力，不是依赖）：
// 同机上别的插件如果知道这个人的习惯（比如 qq-bridge 记录的对群友的印象），
// 可以定期写一份只读快照，本插件拿来补 profile.json 的空缺。
//
// 契约（任何宿主都可以写，插件只读）：
//   $DSH_HOME/whale-weather/user-context.json
//   { "version": 1, "updatedAt": <ms>, "source": "<插件名>",
//     "user": { "qq": "741934896", "displayName": "…",
//               "traits": ["…"], "interactionCount": 3, "lastSeenAt": <ms> } }
//
// 规则：
//   · 没有这个文件 → 一切照旧，插件照常工作（偏好只来自 profile.json）
//   · 快照超过 7 天视为过期；坏 JSON 直接忽略
//   · 偏好档案里的值永远优先，快照只补空缺、不覆盖用户亲手设过的字段
//   · 匹配不上关键词就不猜，绝不把自由文本原样拼进天气话术

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function userContextPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'user-context.json');
}

/**
 * 读外部印象快照；没有、损坏、过期都返回 null。
 * 返回体里带上 source / updatedAt，方便话术里说清「这是从哪来的印象」。
 */
export async function loadUserContext() {
  try {
    const raw = await readFile(userContextPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.updatedAt || Date.now() - Number(parsed.updatedAt) > MAX_AGE_MS) return null;
    if (!parsed.user || typeof parsed.user !== 'object') return null;
    return { ...parsed.user, source: typeof parsed.source === 'string' ? parsed.source : '', updatedAt: Number(parsed.updatedAt) };
  } catch {
    return null;
  }
}

/** 从自由文本的印象里提取能落到偏好字段的线索；没有把握的就不猜。 */
export function hintsFromContext(user) {
  const traits = Array.isArray(user?.traits) ? user.traits.filter((t) => typeof t === 'string' && t.trim()) : [];
  const text = traits.join('；');
  const hints = {
    displayName: user?.displayName || '',
    traits,
    interactionCount: Number(user?.interactionCount) || 0,
    source: user?.source || '',
    updatedAt: Number(user?.updatedAt) || 0,
  };

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
  if (hints.traits?.length || hints.displayName || hints.source) out.impressionHints = hints;
  return out;
}
