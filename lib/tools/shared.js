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

/**
 * 解析「这次要查哪儿」：城市 + 可选坐标。
 * 坐标只在**没显式给城市名**时生效 —— 用户临时问「上海」就按上海查，
 * 不能拿 profile 里自己家的坐标去查上海（那是另一种撒谎）。
 * @returns {Promise<{ city: string, lat: number|null, lon: number|null }>}
 */
async function resolvePlace(city) {
  const explicit = city && String(city).trim();
  if (explicit) return { city: explicit, lat: null, lon: null };
  const profile = await effectiveProfile();
  if (profile.lat != null && profile.lon != null) {
    return { city: String(profile.city ?? '').trim() || '这里', lat: profile.lat, lon: profile.lon };
  }
  if (profile.city) return { city: profile.city, lat: null, lon: null };
  throw new Error('还没设置默认城市：先调用 weather_profile 设置 city（或 lat/lon 坐标），或直接在参数里传城市名');
}

/** 兼容旧名字（只返回城市名）。 */
async function resolveCity(city) {
  return (await resolvePlace(city)).city;
}

function cardDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'cards');
}

export { TEXT_OUT, resolveCity, resolvePlace, cardDir };
