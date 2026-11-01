// 情绪记录：把"今天怎么样"从一句寒暄变成可回看的趋势。
//
// 存储：$DSH_HOME/whale-weather/mood.json
//   { entries: [{ at, date, score, note }] }
// score 1~5（1=很差，5=很好）；date 是本地日期 YYYY-MM-DD；最多保留 500 条。
//
// 只记录用户主动说过的（或回答每日问候时的）分数，不推断、不偷偷打分。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MAX_ENTRIES = 500;

export const MOOD_LABELS = {
  1: '很差',
  2: '有点糟',
  3: '一般',
  4: '还行',
  5: '很好',
};

const pad2 = (n) => String(n).padStart(2, '0');
export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function moodPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'mood.json');
}

export function sanitizeMood(input = {}) {
  const score = Number(input.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error('score 必须是 1~5 的整数（1=很差，5=很好）');
  }
  const at = Number(input.at) || Date.now();
  const note = String(input.note ?? '').trim().slice(0, 200);
  return {
    id: String(input.id ?? '').trim() || `m${at.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    at,
    date: todayKey(new Date(at)),
    score,
    note,
  };
}

export async function loadMoods() {
  try {
    const raw = await readFile(moodPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return entries
      .map((e) => {
        try { return sanitizeMood(e); } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

export async function saveMoods(entries) {
  const list = (Array.isArray(entries) ? entries : [])
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_ENTRIES);
  const file = moodPath();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ entries: list }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return list;
}

export async function addMood(input) {
  const entry = sanitizeMood(input);
  const entries = await loadMoods();
  // 同一天同一分钟重复提交（模型重试）只留一条
  const dup = entries.find((e) => e.date === entry.date && Math.abs(e.at - entry.at) < 60_000 && e.score === entry.score);
  if (!dup) entries.push(entry);
  await saveMoods(entries);
  return entry;
}

/** 最近 N 天的每日均分（只返回有记录的日子）。 */
export function moodTrend(entries, { days = 14, now = new Date() } = {}) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  const fromKey = todayKey(from);
  const byDay = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || e.date < fromKey) continue;
    const cur = byDay.get(e.date) || { date: e.date, count: 0, sum: 0, scores: [] };
    cur.count += 1;
    cur.sum += e.score;
    cur.scores.push(e.score);
    byDay.set(e.date, cur);
  }
  return [...byDay.values()]
    .map((d) => ({ date: d.date, avg: Math.round((d.sum / d.count) * 10) / 10, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 一段人话总结：均分 + 最近趋势。 */
export function moodSummary(trend, { days = 14 } = {}) {
  const list = Array.isArray(trend) ? trend : [];
  if (!list.length) return `最近 ${days} 天还没有记录。`;
  const total = list.reduce((s, d) => s + d.avg * d.count, 0);
  const count = list.reduce((s, d) => s + d.count, 0);
  const avg = Math.round((total / count) * 10) / 10;
  const label = avg >= 4.2 ? '整体不错' : avg >= 3.2 ? '比较平稳' : avg >= 2.2 ? '有点低' : '偏低';
  const last = list[list.length - 1];
  let line = `最近 ${days} 天记录了 ${count} 次，平均 ${avg} 分（${label}）`;
  if (last) line += `；最近一次 ${last.date} ${last.avg} 分`;
  return `${line}。`;
}

export function describeMood(entry) {
  if (!entry) return '没有记录';
  const label = MOOD_LABELS[entry.score] ?? '';
  return `${entry.date} ${entry.score} 分${label ? `（${label}）` : ''}${entry.note ? ` · ${entry.note}` : ''}`;
}
