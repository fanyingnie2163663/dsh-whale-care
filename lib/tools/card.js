// weather_card：生成 SVG 天气卡片
import { defineTool } from '@deepseek-ai/dsh-tools';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWeather } from '../providers.js';
import { effectiveProfile } from '../profile.js';
import { buildWeatherCardSvg } from '../card.js';
import { buildCareBrief } from '../care.js';
import { loadReminders, remindersForDay } from '../reminders.js';
import { TEXT_OUT, resolveCity, cardDir } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_card',
      description: '生成一张天气卡片（720×980，SVG）：当前温度、今天区间、降雨/风力/空气、穿衣与带伞建议。返回本地文件路径；要发到 QQ 时把它交给 qq_send_image（QQ 侧会转成 PNG）。用户说「来张天气卡片/天气图」时用。',
      parameters: {
        city: { type: 'string', description: '城市；不传则用 profile 里的默认城市（出差期间自动用出差城市）' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const city = await resolveCity(args?.city);
        const [data, profile] = await Promise.all([fetchWeather(city), effectiveProfile()]);
        const now = new Date();
        const svg = buildWeatherCardSvg(data, profile, { now });
        const dir = cardDir();
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `weather-${Date.now()}.svg`);
        await writeFile(file, svg, 'utf8');
        const brief = buildCareBrief(data, profile, { reminders: remindersForDay(await loadReminders()) });
        return { text: `天气卡片已生成：${file}\n\n${brief}` };
      },
    }));
}
