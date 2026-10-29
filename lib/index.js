// dsh-whale-weather — dsh 适配层。
// 三个工具：
//   weather          详细播报（温度/空气质量/三天预报/建议）
//   weather_care     关心版：结合用户偏好与当前时段，写成一段像人说的话
//   weather_profile  读写用户偏好（城市、称呼、怕冷怕热、出行方式、有没有伞、备注）
//
// 纯逻辑在 ./weather.js 与 ./care.js，可脱离 dsh 单独使用。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { fetchWeather, formatDetailed } from './weather.js';
import { buildCareBrief } from './care.js';
import { loadProfile, saveProfile, describeProfile } from './profile.js';

export const name = 'whale-weather';
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
      return { text: formatDetailed(data) };
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
      return { text: buildCareBrief(data, profile) };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'weather_profile',
    description: '读取或修改天气关心用的用户偏好：城市、称呼、是否怕冷/怕热、出行方式、是否随身带伞、健康备注（如鼻炎、带娃）。这些会改变 weather_care 的措辞和提醒阈值，第一次使用时建议先问用户再设置。action=get 读取；action=set 时用 patch 传要改的字段。',
    parameters: {
      action: { type: 'string', required: true, description: 'get 或 set' },
      patch: {
        type: 'object',
        additionalProperties: false,
        description: 'action=set 时要修改的字段：{ city, nickname, coldSensitive, heatSensitive, commute(walk|bike|transit|drive|none), hasUmbrella, notes }',
        properties: {
          city: { type: 'string', description: '默认城市' },
          nickname: { type: 'string', description: '希望被怎么称呼' },
          coldSensitive: { type: 'boolean', description: '是否怕冷' },
          heatSensitive: { type: 'boolean', description: '是否怕热' },
          commute: { type: 'string', description: 'walk | bike | transit | drive | none' },
          hasUmbrella: { type: 'boolean', description: '是否随身带伞' },
          notes: { type: 'string', description: '健康备注，如「有鼻炎」' },
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
}
