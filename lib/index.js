// dsh-whale-care — dsh 适配层。
// 关心引擎：天气是第一个（也是最便宜、最直接的）关心来源，提醒/预警都挂在它上面。
// 五个工具：
//   weather          详细播报（温度/空气质量/三天预报/建议/预警）
//   weather_care     关心版：结合用户偏好与当前时段，写成一段像人说的话
//   weather_profile  读写用户偏好（城市、称呼、怕冷怕热、出行方式、有没有伞、备注）
//   weather_reminder 统一提醒：到点的吃药/喝水，或带天气条件的提醒
//   weather_alert    极端天气预警（暴雨/大风/高温/寒潮/雷电/沙尘/大雾/空气污染）
//
// 纯逻辑在 ./weather.js、./care.js、./reminders.js、./alerts.js，可脱离 dsh 单独使用。
// 天气源可换：见 ./providers.js（内置 wttr / openmeteo，也支持自定义模块）。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { formatDetailed } from './weather.js';
import { fetchWeather } from './providers.js';
import { buildCareBrief } from './care.js';
import { loadProfile, saveProfile, describeProfile } from './profile.js';
import { evaluateAlerts, formatAlert, loadFiredAlerts, saveFiredAlerts, todayKey as alertDay } from './alerts.js';
import {
  loadReminders, saveReminders, addReminder, removeReminder,
  dueReminders, evaluateWeatherReminder, describeReminder, todayKey, WEATHER_TYPES,
} from './reminders.js';

export const name = 'whale-care';
export const inject = ['tools'];

const TEXT_OUT = {
  schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string', required: true } } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
};

async function resolveCity(city) {
  if (city && String(city).trim()) return String(city).trim();
  const profile = await loadProfile();
  if (profile.city) return profile.city;
  throw new Error('还没设置默认城市：先调用 weather_profile 设置 city，或直接在参数里传 city');
}

export function apply(ctx) {
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
      const city = await resolveCity(args?.city);
      const data = await fetchWeather(city, { days: args?.days });
      const alerts = evaluateAlerts(data);
      const alertBlock = alerts.length ? `\n\n预警（预报推算）：\n${alerts.map(formatAlert).join('\n')}` : '';
      return { text: `${formatDetailed(data)}${alertBlock}\n\n（数据源：${data.provider || '未知'}）` };
    },
  }));

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
      const [data, profile] = await Promise.all([fetchWeather(city, { days: args?.days }), loadProfile()]);
      const alerts = evaluateAlerts(data);
      const prefix = alerts.length ? `${alerts.slice(0, 2).map(formatAlert).join('\n')}\n` : '';
      return { text: prefix + buildCareBrief(data, profile) };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'weather_profile',
    description: '读取或修改天气关心用的用户偏好：城市、称呼、是否怕冷/怕热、出行方式、是否随身带伞、健康备注（如鼻炎、带娃），以及每天早上那条主动关心的开关（dailyCare）和固定发送时间（careTime）。这些会改变 weather_care 的措辞、提醒阈值和主动push。第一次使用时建议先问用户再设置。action=get 读取；action=set 时用 patch 传要改的字段。',
    parameters: {
      action: { type: 'string', required: true, description: 'get 或 set' },
      patch: {
        type: 'object',
        additionalProperties: false,
        description: 'action=set 时要修改的字段：{ city, nickname, coldSensitive, heatSensitive, commute(walk|bike|transit|drive|none), hasUmbrella, notes, dailyCare, careTime }',
        properties: {
          city: { type: 'string', description: '默认城市' },
          nickname: { type: 'string', description: '希望被怎么称呼' },
          coldSensitive: { type: 'boolean', description: '是否怕冷' },
          heatSensitive: { type: 'boolean', description: '是否怕热' },
          commute: { type: 'string', description: 'walk | bike | transit | drive | none' },
          hasUmbrella: { type: 'boolean', description: '是否随身带伞' },
          notes: { type: 'string', description: '健康备注，如「有鼻炎」' },
          dailyCare: { type: 'boolean', description: '每天早上主动发一条天气关心；false = 关掉（说「别每天发了」时用）' },
          careTime: { type: 'string', description: '每天发关心的时刻，24 小时制 HH:MM（如 07:45）；不设 = 跟着作息自适应' },
        },
      },
    },
    output: TEXT_OUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      if (String(args?.action ?? '').toLowerCase() === 'set') {
        const saved = await saveProfile(args?.patch ?? {});
        return { text: `已更新偏好：${describeProfile(saved)}` };
      }
      const profile = await loadProfile();
      return { text: `当前偏好：${describeProfile(profile)}` };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'weather_reminder',
    description: '统一提醒工具：到点提醒吃药/喝水（intent=text），或到点检查天气后再提醒（intent=weather：降雨/降温/大风/昼夜温差/空气质量，条件命中才说）。action=add 新增、list 查看、remove 删除、due 取“现在到点该说的提醒”（会标记今天已发）。天气条件在到期那一刻用最新预报评估，所以提前设的提醒不会说错。',
    parameters: {
      action: { type: 'string', required: true, description: 'add | list | remove | due' },
      id: { type: 'string', description: 'action=remove 时要删除的提醒 id' },
      label: { type: 'string', description: '提醒内容（如「吃降压药」「今天要不要带伞」）' },
      time: { type: 'string', description: '每天提醒时间，HH:MM（24 小时制）' },
      intent: { type: 'string', description: 'text（无条件）或 weather（天气条件命中才提醒），默认 text' },
      days: {
        type: 'array',
        description: '只在周几提醒，1=周一 … 7=周日；不传=每天',
        items: { type: 'integer' },
      },
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
          days: args?.days, weather: args?.weather,
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
      if (due.some((it) => it.intent === 'weather')) {
        try {
          const profile = await loadProfile();
          data = await fetchWeather(args?.city || profile.city || '合肥');
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
      if (!lines.length) return { text: `到点 ${due.length} 条，但天气条件都没命中（跳过 ${skippedWeather} 条），不用提醒。` };
      return { text: lines.join('\n') };
    },
  }));

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
