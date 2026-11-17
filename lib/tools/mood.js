// weather_mood：情绪打分与趋势
import { defineTool } from '@deepseek-ai/dsh-tools';
import { addMood, loadMoods, moodTrend, moodSummary, describeMood } from '../mood.js';
import { TEXT_OUT } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_mood',
      description: '记录/回看情绪打分（1=很差，5=很好）。用户说「今天好累/今天很开心/有点烦」，或回答「今天过得怎么样」时，用 action=log 记一条（可带一句 note）；action=list 看最近记录；action=trend 看最近 14 天趋势。只记用户真实说过的，不推断、不替用户打分。',
      parameters: {
        action: { type: 'string', required: true, description: 'log 记录 / list 最近记录 / trend 趋势' },
        score: { type: 'integer', description: 'action=log 时的分数：1~5（1=很差，5=很好）' },
        note: { type: 'string', description: 'action=log 时的备注，如「加班到十点」' },
        days: { type: 'integer', description: 'action=trend 的回看天数，默认 14' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const action = String(args?.action ?? 'log').toLowerCase();
        if (action === 'log') {
          const entry = await addMood({ score: args?.score, note: args?.note });
          const summary = moodSummary(moodTrend(await loadMoods()));
          return { text: `记下了：${describeMood(entry)}。${summary}` };
        }
        const entries = await loadMoods();
        if (action === 'trend') {
          const days = Math.max(1, Math.min(90, Number(args?.days) || 14));
          const trend = moodTrend(entries, { days });
          if (!trend.length) return { text: `最近 ${days} 天还没有情绪记录。` };
          const lines = trend.map((d) => `${d.date} ${d.avg} 分${d.count > 1 ? `（${d.count} 次）` : ''}`);
          return { text: `${moodSummary(trend, { days })}\n${lines.join('\n')}` };
        }
        if (!entries.length) return { text: '还没有情绪记录。' };
        const recent = entries.slice(-10).reverse();
        return { text: recent.map(describeMood).join('\n') };
      },
    }));
}
