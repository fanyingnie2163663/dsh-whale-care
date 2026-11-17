// 工具之间共用的东西：输出形状、城市解析、卡片目录。
import path from 'node:path';
import os from 'node:os';
import { effectiveProfile } from '../profile.js';

/**
 * @type {{
 *   schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string', required: true } } },
 *   render: (args: any, value: { text: string }) => any[],
 * }}
 */
const TEXT_OUT = {
  schema: { type: 'object', additionalProperties: true, properties: { text: { type: 'string', required: true } } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
};

async function resolveCity(city) {
  if (city && String(city).trim()) return String(city).trim();
  const profile = await effectiveProfile();
  if (profile.city) return profile.city;
  throw new Error('还没设置默认城市：先调用 weather_profile 设置 city，或直接在参数里传 city');
}

function cardDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'cards');
}

export { TEXT_OUT, resolveCity, cardDir };
