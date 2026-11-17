// 用户偏好档案：让"关心"能落到具体的人，而不是对所有人说同样的话。
// 存储位置：$DSH_HOME/whale-weather/profile.json（默认 ~/.dsh/whale-weather/profile.json）。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadUserContext, hintsFromContext, mergeHints } from './user-context.js';

const FIELDS = {
  city: 'string',          // 默认城市
  travelCity: 'string',    // 出差/临时所在城市（配合 travelUntil）
  travelUntil: 'string',   // 临时城市用到哪天（YYYY-MM-DD，含当天）
  nickname: 'string',      // 希望被怎么称呼
  coldSensitive: 'boolean',// 怕冷：降温阈值更敏感
  heatSensitive: 'boolean',// 怕热：高温提醒更早
  commute: 'string',       // walk | bike | transit | drive | none
  hasUmbrella: 'boolean',  // 有没有随身伞
  notes: 'string',         // 自由备注，如「有鼻炎」「带娃」
  dailyCare: 'boolean',    // 每天早晨主动关心的开关（默认开）
  careTime: 'string',      // 每天几点发关心（HH:MM）；不设 = 跟着作息自适应
  updatedAt: 'number'
};

export function profilePath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'profile.json');
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 本地日期 'YYYY-MM-DD'。 */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 真实日历日校验（拒绝 2026-02-30）。 */
export function isDateKey(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

/** 出差城市是否还在有效期内（含 travelUntil 当天）。 */
export function travelActive(profile = {}, now = new Date()) {
  if (!profile || !profile.travelCity || !profile.travelUntil) return false;
  if (!isDateKey(profile.travelUntil)) return false;
  return profile.travelUntil >= dateKey(now);
}

export function sanitizeProfile(input) {
  /** @type {Record<string, any>} */
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, type] of Object.entries(FIELDS)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (type === 'string') {
      const text = String(value).trim();
      if (text) out[key] = text.slice(0, 200);
    } else if (type === 'boolean') {
      out[key] = value === true || value === 'true' || value === 1;
    } else if (type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
  }
  if (out.commute && !['walk', 'bike', 'transit', 'drive', 'none'].includes(out.commute)) delete out.commute;
  // 关心时间只认 24 小时制 HH:MM，写错就丢掉（当作没设置，回落到自适应/默认）
  if (out.careTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.careTime)) delete out.careTime;
  // 出差日期只认 YYYY-MM-DD；格式不对就丢掉，避免 effectiveProfile 里字符串比较出错
  if (out.travelUntil && !isDateKey(out.travelUntil)) delete out.travelUntil;
  return out;
}

/** @returns {Promise<Record<string, any>>} */
export async function loadProfile() {
  try {
    const raw = await readFile(profilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeProfile(parsed);
  } catch {
    return {};
  }
}

export async function saveProfile(patch, { clear = [] } = {}) {
  const input = patch && typeof patch === 'object' ? patch : {};
  const current = await loadProfile();
  /** @type {Record<string, any>} */
  const next = { ...current, ...sanitizeProfile(input), updatedAt: Date.now() };
  const clearKeys = Array.isArray(clear) ? clear : [];
  for (const key of clearKeys) delete next[key];

  const touchedTravel = ['travelCity', 'travelUntil'].some((k) => k in input)
    || clearKeys.some((k) => k === 'travelCity' || k === 'travelUntil');
  if (touchedTravel) {
    // 出差城市和截止日期必须成对；清空任一个就两个一起清
    if (!next.travelCity || !next.travelUntil) {
      delete next.travelCity;
      delete next.travelUntil;
    } else {
      if (!isDateKey(next.travelUntil)) throw new Error('travelUntil 必须是 YYYY-MM-DD');
      if (next.travelUntil < dateKey()) throw new Error('travelUntil 不能早于今天');
    }
  }
  // 过期的出差信息顺手清掉，避免下次 describe 还显示
  if (next.travelUntil && next.travelUntil < dateKey()) {
    delete next.travelCity;
    delete next.travelUntil;
  }

  const file = profilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return next;
}

export function describeProfile(profile) {
  const bits = [];
  if (profile.nickname) bits.push(`称呼「${profile.nickname}」`);
  const traveling = travelActive(profile);
  if (traveling) {
    bits.push(`当前城市 ${profile.travelCity}（出差到 ${profile.travelUntil}）`);
    const home = profile.defaultCity
      || (profile.city && profile.city !== profile.travelCity ? profile.city : null);
    if (home && home !== profile.travelCity) bits.push(`默认城市 ${home}`);
  } else if (profile.city) {
    bits.push(`默认城市 ${profile.city}`);
  }
  if (profile.coldSensitive) bits.push('怕冷');
  if (profile.heatSensitive) bits.push('怕热');
  if (profile.commute) bits.push({ walk: '步行', bike: '骑车', transit: '公交/地铁', drive: '开车', none: '不怎么出门' }[profile.commute] || profile.commute);
  if (profile.hasUmbrella === true) bits.push('随身带伞');
  if (profile.hasUmbrella === false) bits.push('经常不带伞');
  if (profile.notes) bits.push(`备注：${profile.notes}`);
  if (profile.dailyCare === false) bits.push('每天天气关心：关');
  if (profile.careTime) bits.push(`天气关心时间 ${profile.careTime}`);
  const hints = profile.impressionHints;
  if (hints?.traits?.length) {
    const from = hints.source ? `（来自 ${hints.source}）` : '';
    bits.push(`印象${from}：${hints.traits.slice(0, 3).join('；')}`);
  } else if (hints?.source) {
    bits.push(`印象：来自 ${hints.source}（暂无可用的偏好线索）`);
  }
  return bits.length ? bits.join(' · ') : '（还没设置偏好）';
}

/**
 * 偏好档案 + 桥接印象合并后的只读视图（profile 优先，快照只补空缺）。
 * 出差期间 city 会被替换成 travelCity；defaultCity 保留原城市，方便话术里说"回你那边"。
 * 供 weather / weather_care / weather_reminder 读取；saveProfile 仍然只写 profile.json。
 */
export async function effectiveProfile(now = new Date()) {
  const [profile, context] = await Promise.all([loadProfile(), loadUserContext()]);
  const merged = context ? mergeHints(profile, hintsFromContext(context)) : profile;
  if (!travelActive(merged, now)) return merged;
  return { ...merged, defaultCity: merged.city, city: merged.travelCity };
}
