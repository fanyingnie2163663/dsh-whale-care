// 坐标：把「地图 App 里粘出来的 31.8639,117.2808」变成能用的经纬度，并记住城市名解析结果。
//
// 为什么需要它：中文区名（蜀山区 / 朝阳区 / 包河区）在 Open-Meteo 的地理编码里查不到，
// 只能靠坐标定位（天气和 AQI 接口本来就吃 latitude/longitude，零新依赖、零 API key）。
//
// 精度说实话：Open-Meteo 网格约 1–11km，区与区之间气温通常只差 1–2°C，
// 真正有区级意义的是 AQI（工业区 vs 公园差别很大）。别承诺「区级精准气温」。
//
// 这里只做两件事，都不联网：
//   · parseLatLon()：解析 / 校验坐标（成对、范围）；
//   · geocode 缓存：$DSH_HOME/whale-weather/geocode-cache.json，记住「城市名 → 坐标」，
//     让 weather_profile 的 describe 能回显「系统自己解析出来的是哪」，也省掉重复请求。
//     读写失败一律忽略（缓存不是功能依赖）。

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const MAX_ITEMS = 200;

export const LAT_RANGE = [-90, 90];
export const LON_RANGE = [-180, 180];

const toNum = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** 成对的经纬度 + 范围校验：不合法就返回 null（读侧永不抛错）。 */
export function coordsOf(lat, lon) {
  const la = toNum(lat);
  const lo = toNum(lon);
  if (la === null || lo === null) return null;
  if (la < LAT_RANGE[0] || la > LAT_RANGE[1]) return null;
  if (lo < LON_RANGE[0] || lo > LON_RANGE[1]) return null;
  return { lat: la, lon: lo };
}

/**
 * 解析粘贴串：'31.8639,117.2808'（国内地图 App 复制的形态，也接受空格、全角逗号、带正负号）。
 * @returns {{lat:number, lon:number} | null} 解析不了 / 越界 / 只给一半 → null（调用方负责报错说明格式）
 */
export function parseLatLon(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const parts = raw.split(/[,，;；\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  return coordsOf(parts[0], parts[1]);
}

export function formatCoords(coords) {
  if (!coords) return '';
  return coords.lat + ', ' + coords.lon;
}

export function geocodeCachePath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'geocode-cache.json');
}

async function readCache() {
  try {
    const parsed = JSON.parse(await readFile(geocodeCachePath(), 'utf8'));
    const items = parsed && typeof parsed.items === 'object' && parsed.items ? parsed.items : {};
    return items;
  } catch {
    return {};
  }
}

/** 记住「城市名 → 坐标」（写失败就算了，缓存不是依赖）。 */
export async function rememberGeocode(city, lat, lon) {
  const key = String(city ?? '').trim();
  const coords = coordsOf(lat, lon);
  if (!key || !coords) return;
  try {
    const items = await readCache();
    items[key] = { lat: coords.lat, lon: coords.lon, at: Date.now() };
    const entries = Object.entries(items).sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0)).slice(0, MAX_ITEMS);
    const file = geocodeCachePath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ version: 1, items: Object.fromEntries(entries) }, null, 2) + '\n', 'utf8');
  } catch {
    // 缓存写不进去不影响查天气
  }
}

/** 查「这个城市上次解析出来的坐标」；没有就是 null。 */
export async function cachedCoords(city) {
  const key = String(city ?? '').trim();
  if (!key) return null;
  const items = await readCache();
  const hit = items[key];
  return hit ? coordsOf(hit.lat, hit.lon) : null;
}
