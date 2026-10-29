// dsh-whale-weather — dsh 适配层：只负责把 weather 工具注册进 agent。
// 纯逻辑（取数、中文映射、建议规则）在 ./weather.js，可脱离 dsh 单独使用。

import { defineTool } from '@deepseek-ai/dsh-tools';
import { buildWeatherReport } from './weather.js';

export const name = 'whale-weather';
export const inject = ['tools'];

const TEXT_OUT = {
  schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string', required: true } } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
};

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'weather',
    description: '查天气（免费，无需 API Key）：当前天气、空气质量（AQI/PM2.5）、未来三天预报（降雨概率、风力），并给出带伞/穿衣/防风/出行建议。城市可写中文、拼音或英文。查不到城市就如实说明。',
    parameters: {
      city: { type: 'string', required: true, description: '城市名，中文/拼音/英文均可，例如 合肥、Hefei、Tokyo' },
      days: { type: 'integer', description: '预报天数 1~3，默认 3' },
    },
    output: TEXT_OUT,
    isConcurrencySafe: () => true,
    async execute(args) {
      const text = await buildWeatherReport(args?.city, { days: args?.days });
      return { text };
    },
  }));
}
