// weather_reminder：统一提醒（定时 / 天气条件 / 一次性 / 每年）
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather } from '../providers.js';
import { effectiveProfile } from '../profile.js';
import { loadReminders, saveReminders, addReminder, removeReminder, dueReminders, evaluateWeatherReminder, describeReminder, todayKey } from '../reminders.js';
import { TEXT_OUT } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_reminder',
      description: '统一提醒工具：到点提醒吃药/喝水（intent=text），或到点检查天气后再提醒（intent=weather：降雨/降温/大风/昼夜温差/空气质量，条件命中才说）。时间表支持每天、每周几（days）、一次性（date=YYYY-MM-DD）、每年（yearly=MM-DD，生日/纪念日）。action=add 新增、list 查看、remove 删除、due 取“现在到点该说的提醒”（会标记今天已发）。天气条件在到期那一刻用最新预报评估，所以提前设的提醒不会说错。',
      parameters: {
        action: { type: 'string', required: true, description: 'add | list | remove | due' },
        id: { type: 'string', description: 'action=remove 时要删除的提醒 id' },
        label: { type: 'string', description: '提醒内容（如「吃降压药」「今天要不要带伞」）' },
        time: { type: 'string', description: '提醒时间，HH:MM（24 小时制）' },
        intent: { type: 'string', description: 'text（无条件）或 weather（天气条件命中才提醒），默认 text' },
        days: {
          type: 'array',
          description: '只在周几提醒，1=周一 … 7=周日；不传=每天',
          items: { type: 'integer' },
        },
        date: { type: 'string', description: '一次性日期 YYYY-MM-DD（如 2026-11-20）；与 days/yearly 互斥' },
        yearly: { type: 'string', description: '每年 MM-DD（生日/纪念日，如 11-20）；与 date/days 互斥' },
        weather: {
          type: 'object',
          additionalProperties: false,
          description: 'intent=weather 时的条件：{ type: rain|tempDrop|wind|swing|aqi, threshold }',
          properties: {
            type: { type: 'string', description: 'rain 降雨 / tempDrop 降温 / wind 大风 / swing 温差 / aqi 空气质量' },
            threshold: { type: 'number', description: '阈值：降雨% / 降温°C / 风速km/h / 温差°C / AQI' },
          },
        },
        city: { type: 'string', description: 'action=due 时评估天气用；不传用 profile 里的默认城市' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const action = String(args?.action ?? '').toLowerCase();
        if (action === 'add') {
          const item = await addReminder({
            label: args?.label, time: args?.time, intent: args?.intent,
            days: args?.days, date: args?.date, yearly: args?.yearly, weather: args?.weather,
          });
          return { text: `已添加提醒：${describeReminder(item)}（id=${item.id}）` };
        }
        if (action === 'remove') {
          const ok = await removeReminder(args?.id);
          return { text: ok ? `已删除提醒 ${args.id}` : `找不到提醒 ${args?.id ?? ''}` };
        }
        if (action === 'list') {
          const items = await loadReminders();
          if (!items.length) return { text: '还没有设置提醒。' };
          return { text: items.map((it) => `${it.enabled === false ? '（停用）' : ''}${describeReminder(it)}（id=${it.id}）`).join('\n') };
        }
        // due
        const items = await loadReminders();
        const due = dueReminders(items);
        if (!due.length) return { text: '现在没有到点的提醒。' };
        let data = null;
        let city = null;
        if (due.some((it) => it.intent === 'weather')) {
          try {
            const profile = await effectiveProfile();
            // 不再硬编码兜底城市：没设城市就明确说"判断不了"，而不是偷偷给一个默认城市
            city = args?.city || profile.city || null;
            if (city) data = await fetchWeather(city);
          } catch { data = null; }
        }
        const lines = [];
        let skippedWeather = 0;
        for (const it of due) {
          if (it.intent === 'weather') {
            const res = data ? evaluateWeatherReminder(it, data) : { matched: false };
            if (res.matched) lines.push(`⚠️ ${res.line}`);
            else skippedWeather += 1;
          } else {
            lines.push(`⏰ ${it.label}（${it.time}）`);
          }
          it.lastFiredDate = todayKey();
        }
        await saveReminders(items);
        if (!lines.length) {
          const why = skippedWeather && !city
            ? `（没设置城市，${skippedWeather} 条天气类提醒判断不了；先用 weather_profile 设 city）`
            : `（跳过 ${skippedWeather} 条）`;
          return { text: `到点 ${due.length} 条，但天气条件都没命中${why}，不用提醒。` };
        }
        return { text: lines.join('\n') };
      },
    }));
}
