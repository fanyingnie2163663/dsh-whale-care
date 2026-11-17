// 周卡 · 本周 token 用量：两级来源，只读、只算，拿不到就给 null（渲染层据此省略整块）。
//
// 一级（契约快照，优先）：$DSH_HOME/whale-weather/usage.json
//   { "version": 1, "updatedAt": <ms>, "source": "<谁采的>",
//     "week": { "tokens": 1234567, "cost": 12.5, "turns": 42,
//               "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } }
//   —— 和 user-context.json 同一套套路：谁采谁写，本插件只读；超过 7 天视为过期
//      （没人刷新就说明数字是旧的，宁可不显示，也不显示上周的数当本周）。
//
// 二级（已知来源兼容，不是依赖）：$DSH_HOME/.dshw-usage.json
//   { date, lastBalance, todayUsage,
//     history: { "YYYY-MM-DD": 花费(元) },
//     events: [ { ts, day, model, cost, tokens } ] }
//   —— 这是 DSH 桌面端自己的用量账本（别人的私有文件）：只读、容错。
//      坏 JSON / 缺字段 / 没有这个文件，全部当「没有」，绝不抛错、绝不写回。
//      这里只是「已知来源兼容」，不是对那个文件的承诺：它换格式我们就当没数据。
//
// 口径（一角 v1.1 定的渲染口径：周窗 = 过去 7 天 D-6…D0）：
//   · 默认窗口 window='rolling'：本机本地时间「今天往前数 7 天」（D-6 00:00 ~ 今天 23:59），
//     一串「最近 7 天」的连续日，和情绪/天气的滚动 7 天同窗；
//   · window='monday'：周一 00:00 ~ 周日 23:59（weekly.js 的周卡周界，带「第几周」）。
//     两个口径不一致时由渲染侧决定用哪个，数据层只负责把 from/to 标清楚；
//   · 一周的 from/to 一律写进返回值，渲染层不用自己推日期；
//   · tokens 求和保持原始整数，不做四舍五入、不换单位（渲染格式归美术定）；
//   · 只给「这周发生过的」：events 按 day（没有就按 ts 推本地日期）过滤，
//     history 只有每日花费、没有 tokens/turns，所以只在 events 整段缺失时兜底。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { todayKey } from './mood.js';
import { weekWindow } from './weekly.js';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isDayKey = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const intOrNull = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && Number.isFinite(n) ? n : null;
};
const numOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
// 元只留 4 位小数：浮点求和会冒出 0.30000000000000004 这类噪声
const roundCost = (n) => Math.round(n * 1e4) / 1e4;

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

export function usageSnapshotPath() {
  return path.join(dshHome(), 'whale-weather', 'usage.json');
}

export function ledgerPath() {
  return path.join(dshHome(), '.dshw-usage.json');
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null; // 没有文件 / 坏 JSON / 权限不足：一律当没有
  }
}

/** 一级来源：读契约快照；没有、版本不对、坏 JSON、过期、只有 null → null。 */
export async function loadUsageSnapshot({ now = new Date(), maxAgeMs = MAX_AGE_MS } = {}) {
  const parsed = await readJson(usageSnapshotPath());
  if (!parsed || parsed.version !== 1) return null;
  const updatedAt = Number(parsed.updatedAt);
  // 没有时间戳就没法判断新旧，当作过期处理
  if (!Number.isFinite(updatedAt) || now.getTime() - updatedAt > maxAgeMs) return null;
  const week = parsed.week;
  if (!week || typeof week !== 'object') return null;
  const out = {
    tokens: intOrNull(week.tokens),
    cost: numOrNull(week.cost),
    turns: intOrNull(week.turns),
    from: isDayKey(week.from) ? week.from : null,
    to: isDayKey(week.to) ? week.to : null,
    source: typeof parsed.source === 'string' && parsed.source ? parsed.source : 'usage-snapshot',
  };
  if (out.tokens == null && out.cost == null && out.turns == null) return null;
  if (out.cost != null) out.cost = roundCost(out.cost);
  return out;
}

/**
 * 二级来源的纯聚合：把账本里落在 [from, to] 的事件加总。
 * @returns {{ tokens: number|null, cost: number|null, turns: number|null }}
 */
export function sumLedgerWindow(ledger, { from = null, to = null } = {}) {
  const events = Array.isArray(ledger?.events) ? ledger.events : [];
  const history = ledger?.history && typeof ledger.history === 'object' ? ledger.history : null;
  const inWindow = (key) => Boolean(key) && (!from || key >= from) && (!to || key <= to);
  const dayOf = (event) => {
    if (isDayKey(event?.day)) return event.day;
    const ts = Number(event?.ts);
    return Number.isFinite(ts) ? todayKey(new Date(ts)) : null;
  };

  let tokens = null;
  let cost = null;
  let turns = 0;
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (!inWindow(dayOf(event))) continue;
    turns += 1;
    const tokenValue = intOrNull(event.tokens);
    if (tokenValue != null) tokens = (tokens ?? 0) + tokenValue;
    const costValue = numOrNull(event.cost);
    if (costValue != null) cost = (cost ?? 0) + costValue;
  }

  // events 整段缺失（或全落在窗口外）时才退回 history：那里只有每日花费
  if (turns === 0 && history) {
    for (const [key, value] of Object.entries(history)) {
      if (!inWindow(key)) continue;
      const costValue = numOrNull(value);
      if (costValue != null) cost = (cost ?? 0) + costValue;
    }
  }

  return {
    tokens,
    cost: cost == null ? null : roundCost(cost),
    turns: turns > 0 ? turns : null,
  };
}

/** 滚动周窗：今天往前数 7 天（D-6 … D0），返回 from/to 日期键。 */
export function rollingWeek(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const first = new Date(today);
  first.setDate(today.getDate() - 6);
  return { from: todayKey(first), to: todayKey(today) };
}

/**
 * 本周用量总入口：先快照，再账本，都没有 → null。
 * @param {{ now?: Date, window?: 'rolling'|'monday' }} [options]
 *   window='rolling'（默认）走 D-6…D0；'monday' 走周一~周日（weekly.js 的周界）
 * @returns {Promise<{tokens:number|null, cost:number|null, turns:number|null,
 *                    from:string, to:string, source:string} | null>}
 */
export async function loadWeeklyUsage({ now = new Date(), window = 'rolling' } = {}) {
  const snapshot = await loadUsageSnapshot({ now });
  if (snapshot) return snapshot;

  const mondayWeek = window === 'monday' ? weekWindow(now) : null;
  const span = mondayWeek ? { from: mondayWeek.start, to: mondayWeek.end } : rollingWeek(now);
  const ledger = await readJson(ledgerPath());
  if (!ledger) return null;
  const sums = sumLedgerWindow(ledger, span);
  if (sums.tokens == null && sums.cost == null && sums.turns == null) return null;
  return {
    tokens: sums.tokens,
    cost: sums.cost,
    turns: sums.turns,
    from: span.from,
    to: span.to,
    source: 'dshw-usage',
  };
}
