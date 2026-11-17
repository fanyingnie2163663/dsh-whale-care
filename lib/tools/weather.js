// weather：详细播报（当前 + 三天预报 + 预警 + 建议）
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather } from '../providers.js';
import { formatDetailed } from '../weather.js';
import { evaluateAlerts, formatAlert } from '../alerts.js';
import { TEXT_OUT, resolvePlace } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather',
      description: '查天气（免费，无需 API Key）：当前天气、空气质量（AQI/PM2.5）、未来三天预报（降雨概率、风力），并给出带伞/穿衣/防风/出行建议。要"关心用户"时优先用 weather_care。城市可写中文、拼音或英文。',
      parameters: {
        city: { type: 'string', description: '城市名，中文/拼音/英文均可；不传则用 profile 里的默认城市' },
        days: { type: 'integer', description: '预报天数 1~3，默认 3' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const { city, lat, lon } = await resolvePlace(args?.city);
        const data = await fetchWeather(city, { days: args?.days, lat, lon });
        const alerts = evaluateAlerts(data);
        const alertBlock = alerts.length ? `\n\n预警（预报推算）：\n${alerts.map(formatAlert).join('\n')}` : '';
        return { text: `${formatDetailed(data)}${alertBlock}\n\n（数据源：${data.provider || '未知'}）` };
      },
    }));
}
