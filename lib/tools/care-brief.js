// care_brief：今天值得说的 1–3 件 + 依据。被动回答用，不主动推送。
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather } from '../providers.js';
import { effectiveProfile } from '../profile.js';
import { loadReminders, remindersForDay } from '../reminders.js';
import { collectWeatherSignals } from '../engine/sensors/weather.js';
import { collectCalendarSignals } from '../engine/sensors/calendar.js';
import { judge } from '../engine/judge.js';
import { renderBrief } from '../engine/voice.js';
import { TEXT_OUT, resolveCity } from './shared.js';

export function register(ctx) {
  ctx.tools.register(defineTool({
    name: 'care_brief',
    description: '今天值得说的几件事（最多三条）：从天气里挑出对这个人今天真正有影响的部分，加上今天到点的提醒，写成一段可以直接发出去的话。和 weather_care 的区别：weather_care 是完整的关心播报，care_brief 是短版——只留最要紧的一两条，适合聊天里随口说一句。',
    parameters: {
      city: { type: 'string', description: '城市；不传则用 profile 里的默认城市' },
      days: { type: 'integer', description: '预报天数 1~3，默认 2' },
    },
    output: TEXT_OUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const city = await resolveCity(args?.city);
      const [data, profile, reminders] = await Promise.all([
        fetchWeather(city, { days: args?.days ?? 2 }),
        effectiveProfile(),
        loadReminders(),
      ]);
      const signals = [...collectWeatherSignals(data, profile), ...collectCalendarSignals({ now: new Date() })];
      const { chosen } = judge(signals, { limit: 3 });
      const extras = remindersForDay(reminders).map((r) => ({ time: r.time, label: r.label }));
      const text = renderBrief({ signals: chosen, profile, extras });
      return { text: text || '今天没什么特别的，按平常来就好。' };
    },
  }));
}
