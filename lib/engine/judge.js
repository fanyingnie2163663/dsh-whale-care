// 判断层：把一堆信号收敛成「今天值得说的几条」。
// 规则：同一 topic 只留一条（取权重最高的）；按权重排序；必须说的（提醒、预警）不参与取舍。

const weightOf = (s) => (Number.isFinite(s?.weight) ? s.weight : 0);

/**
 * @param {Array<{topic:string, weight:number}>} signals
 * @param {{limit?: number, must?: Array}} [opts]
 */
export function judge(signals = [], { limit = 3, must = [] } = {}) {
  const byTopic = new Map();
  for (const signal of Array.isArray(signals) ? signals : []) {
    if (!signal || !signal.topic) continue;
    const seen = byTopic.get(signal.topic);
    if (!seen || weightOf(signal) > weightOf(seen)) byTopic.set(signal.topic, signal);
  }
  const ranked = [...byTopic.values()].sort((a, b) => weightOf(b) - weightOf(a));
  const required = Array.isArray(must) ? must.filter(Boolean) : [];
  const optional = ranked.filter((s) => !required.includes(s)).slice(0, Math.max(0, limit));
  return { chosen: [...required, ...optional], rest: ranked.filter((s) => !required.includes(s)).slice(Math.max(0, limit)) };
}
