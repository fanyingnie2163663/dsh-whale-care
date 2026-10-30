// 用户偏好档案：让"关心"能落到具体的人，而不是对所有人说同样的话。
// 存储位置：$DSH_HOME/whale-weather/profile.json（默认 ~/.dsh/whale-weather/profile.json）。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadUserContext, hintsFromContext, mergeHints } from './user-context.js';

const FIELDS = {
  city: 'string',          // 默认城市
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

export function sanitizeProfile(input) {
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
  return out;
}

export async function loadProfile() {
  try {
    const raw = await readFile(profilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeProfile(parsed);
  } catch {
    return {};
  }
}

export async function saveProfile(patch) {
  const current = await loadProfile();
  const next = { ...current, ...sanitizeProfile(patch), updatedAt: Date.now() };
  const file = profilePath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return next;
}

export function describeProfile(profile) {
  const bits = [];
  if (profile.nickname) bits.push(`称呼「${profile.nickname}」`);
  if (profile.city) bits.push(`默认城市 ${profile.city}`);
  if (profile.coldSensitive) bits.push('怕冷');
  if (profile.heatSensitive) bits.push('怕热');
  if (profile.commute) bits.push({ walk: '步行', bike: '骑车', transit: '公交/地铁', drive: '开车', none: '不怎么出门' }[profile.commute] || profile.commute);
  if (profile.hasUmbrella === true) bits.push('随身带伞');
  if (profile.hasUmbrella === false) bits.push('经常不带伞');
  if (profile.notes) bits.push(`备注：${profile.notes}`);
  if (profile.dailyCare === false) bits.push('每天天气关心：关');
  if (profile.careTime) bits.push(`天气关心时间 ${profile.careTime}`);
  const hints = profile.impressionHints;
  if (hints?.traits?.length) bits.push(`印象：${hints.traits.slice(0, 3).join('；')}`);
  return bits.length ? bits.join(' · ') : '（还没设置偏好）';
}

/**
 * 偏好档案 + 桥接印象合并后的只读视图（profile 优先，快照只补空缺）。
 * 供 weather / weather_care / weather_reminder 读取；saveProfile 仍然只写 profile.json。
 */
export async function effectiveProfile() {
  const [profile, context] = await Promise.all([loadProfile(), loadUserContext()]);
  if (!context) return profile;
  return mergeHints(profile, hintsFromContext(context));
}
