// weather_alert：极端天气预警（本地阈值估算）
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather } from '../providers.js';
import { evaluateAlerts, formatAlert, loadFiredAlerts, saveFiredAlerts, todayKey as alertDay } from '../alerts.js';
import { TEXT_OUT, resolveCity } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_alert',
      description: '极端天气预警（按预报数据本地阈值估算，不是气象台正式发布）：暴雨、大风、高温、低温/寒潮、雷电、沙尘、大雾、空气污染，分黄/橙/红三级。默认会把当天已报过的预警记为已报，避免重复提醒；peek=true 只看不记。',
      parameters: {
        city: { type: 'string', description: '城市；不传则用 profile 里的默认城市' },
        peek: { type: 'boolean', description: 'true=只看不标记已报（默认 false）' },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const city = await resolveCity(args?.city);
        const data = await fetchWeather(city);
        const alerts = evaluateAlerts(data);
        if (!alerts.length) return { text: '当前没有达到预警标准的天气。' };
        if (args?.peek === true) return { text: alerts.map(formatAlert).join('\n') };
        const fired = await loadFiredAlerts();
        const today = alertDay();
        const fresh = alerts.filter((a) => fired[a.id] !== today);
        for (const a of fresh) fired[a.id] = today;
        await saveFiredAlerts(fired);
        if (!fresh.length) return { text: '今天的预警已经报过了，没有新增。' };
        return { text: fresh.map(formatAlert).join('\n') };
      },
    }));
}
