// weather_care：关心版，一段直接能发给用户的话
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather } from '../providers.js';
import { buildCareBrief } from '../care.js';
import { evaluateAlerts, formatAlert } from '../alerts.js';
import { effectiveProfile } from '../profile.js';
import { loadReminders, remindersForDay } from '../reminders.js';
import { TEXT_OUT, resolveCity } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_care',
      description: '关心版天气：结合用户偏好（称呼、怕冷/怕热、出行方式、有没有带伞、健康备注）和当前时段（早上/白天/晚上），写成一段可以直接发给用户的话，重点提醒对他真正有影响的事（降温加衣、下雨带伞、风大围巾、高温补水、空气质量、早晚温差），晚上还会预告明天。当用户问"今天天气""要带伞吗""我该穿什么"，或你想主动关心对方时使用。',
      parameters: {
        city: { type: 'string', description: '城市；不传则用 profile 里的默认城市' },
        days: { type: 'integer', description: '预报天数 1~3，默认 3' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const city = await resolveCity(args?.city);
        const [data, profile, reminders] = await Promise.all([
          fetchWeather(city, { days: args?.days }),
          effectiveProfile(),
          loadReminders(),
        ]);
        const alerts = evaluateAlerts(data);
        const prefix = alerts.length ? `${alerts.slice(0, 2).map(formatAlert).join('\n')}\n` : '';
        const todayReminders = remindersForDay(reminders);
        return { text: prefix + buildCareBrief(data, profile, { reminders: todayReminders }) };
      },
    }));
}
