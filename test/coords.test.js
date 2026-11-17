import test from 'node:test'
import nodeAssert from 'node:assert/strict'
import { makeChecker } from './harness.js'

// 离线单测：坐标支持（profile.lat/lon + location 粘贴串 + 不查地理编码 + describe 回显）。
// 网络全用假 fetch：断言「有坐标时不发 geocoding 请求」比断言结果更重要。
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const home = mkdtempSync(path.join(os.tmpdir(), 'whale-coords-'));
process.env.DSH_HOME = home;
mkdirSync(path.join(home, 'whale-weather'), { recursive: true });

const { coordsOf, parseLatLon, rememberGeocode, cachedCoords } = await import('../lib/geo.js');
const { sanitizeProfile, loadProfile, saveProfile, effectiveProfile } = await import('../lib/profile.js');
const { fetchOpenMeteo } = await import('../lib/openmeteo.js');
const { fetchWttr } = await import('../lib/weather.js');
const { fetchWeather, registerProvider } = await import('../lib/providers.js');
const { resolvePlace } = await import('../lib/tools/shared.js');

const { ok: assert, total } = makeChecker()

// ── 假 fetch：记录每个 URL，按端点返回最小可用结构 ──────────────────────
const realFetch = globalThis.fetch;
const calls = [];
function stubFetch({ forecastDays = 3 } = {}) {
  calls.length = 0;
  globalThis.fetch = async (url) => {
    const text = String(url);
    calls.push(text);
    if (text.includes('geocoding-api')) {
      return { ok: true, status: 200, json: async () => ({ results: [{ latitude: 31.86, longitude: 117.28, name: '合肥', country: '中国' }] }) };
    }
    if (text.includes('air-quality')) return { ok: false, status: 503, json: async () => ({}) };
    if (text.includes('api.open-meteo.com')) {
      const dayCount = forecastDays;
      const dates = [];
      for (let i = 0; i < dayCount; i += 1) dates.push('2026-11-' + String(18 + i).padStart(2, '0'));
      const hours = [];
      for (const date of dates) for (let h = 0; h < 24; h += 1) hours.push(date + 'T' + String(h).padStart(2, '0') + ':00');
      const zeros = hours.map(() => 0);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          daily: {
            time: dates,
            temperature_2m_max: dates.map(() => 15),
            temperature_2m_min: dates.map(() => 5),
            weather_code: dates.map(() => 0),
            precipitation_probability_max: dates.map(() => 0),
            precipitation_sum: dates.map(() => 0),
            wind_speed_10m_max: dates.map(() => 10),
          },
          hourly: { time: hours, temperature_2m: zeros, precipitation_probability: zeros, precipitation: zeros, weather_code: zeros },
          current: { temperature_2m: 13, apparent_temperature: 12, relative_humidity_2m: 60, weather_code: 0, wind_speed_10m: 10, uv_index: 2 },
        }),
      };
    }
    if (text.includes('wttr.in')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          current_condition: [{ temp_C: '13', FeelsLikeC: '12', weatherDesc: [{ value: 'Cloudy' }], humidity: '60', windspeedKmph: '10', visibility: '10', uvIndex: '2' }],
          nearest_area: [{ areaName: [{ value: 'Hefei' }], latitude: '31.864', longitude: '117.281' }],
          weather: [],
        }),
      };
    }
    throw new Error('不该请求这个地址：' + text);
  };
}

test('coords', async () => {
  // ── 1. 解析 / 校验 ────────────────────────────────────────────────
  assert(parseLatLon('31.8639,117.2808')?.lat === 31.8639, '标准粘贴串能解析');
  assert(parseLatLon(' 31.8639 , 117.2808 ')?.lon === 117.2808, '带空格能解析');
  assert(parseLatLon('31.8639，117.2808')?.lat === 31.8639, '全角逗号能解析');
  assert(parseLatLon('31.8639') === null, '只有一半 → null');
  assert(parseLatLon('abc,def') === null, '非数字 → null');
  assert(parseLatLon('91,117') === null && parseLatLon('31,181') === null, '越界 → null');
  assert(coordsOf(0, 0)?.lat === 0, '赤道/本初子午线是合法坐标');

  const p1 = sanitizeProfile({ city: '合肥', lat: 31.8639 });
  assert(p1.lat === undefined && p1.lon === undefined, '只有 lat 的档案把坐标丢掉');
  const p2 = sanitizeProfile({ city: '合肥', lat: 100, lon: 117 });
  assert(p2.lat === undefined, '纬度越界被丢掉');
  const p3 = sanitizeProfile({ city: '合肥', lat: 31.8639, lon: 117.2808 });
  assert(p3.lat === 31.8639 && p3.lon === 117.2808, '成对合法坐标保留');

  // ── 2. open-meteo：有坐标就不发地理编码请求 ────────────────────────
  stubFetch();
  const data = await fetchOpenMeteo('合肥', { days: 3, lat: 31.8639, lon: 117.2808 });
  assert(!calls.some((u) => u.includes('geocoding-api')), '有坐标时没有 geocoding 请求（' + calls.length + ' 次请求）');
  assert(calls[0].includes('latitude=31.8639') && calls[0].includes('longitude=117.2808'), '预报请求直接用坐标');
  assert(data.place === '合肥', '坐标 + 城市：显示仍用城市名');

  stubFetch();
  const onlyCoords = await fetchOpenMeteo('', { lat: 31.8639, lon: 117.2808 });
  assert(onlyCoords.place === '这里', '只有坐标没有城市名 → place 为「这里」');
  assert(!calls.some((u) => u.includes('geocoding-api')), '只有坐标也不查地理编码');

  stubFetch();
  const cityOnly = await fetchOpenMeteo('合肥', {});
  assert(calls.some((u) => u.includes('geocoding-api')), '没有坐标时照旧走地理编码');
  assert(cityOnly.place.includes('合肥'), '城市名解析后 place 仍是城市名');

  // ── 3. 城市名查不到时的报错给出路 ─────────────────────────────────
  stubFetch();
  globalThis.fetch = async (url) => (String(url).includes('geocoding-api')
    ? { ok: true, status: 200, json: async () => ({ results: [] }) }
    : { ok: false, status: 500, json: async () => ({}) });
  let notFound = '';
  try { await fetchOpenMeteo('蜀山区', {}); } catch (e) { notFound = e.message; }
  assert(/找不到城市「蜀山区」/.test(notFound), '查不到时报城市名');
  assert(notFound.includes('weather_profile') && /lat\/lon/.test(notFound), '报错里指出路：设 lat/lon');
  assert(notFound.includes('31.8639,117.2808'), '报错里给了坐标示例格式');

  // ── 4. wttr：坐标写法（实测可用）+ 仍然只给 3 天 ────────────────────
  stubFetch();
  const wttr = await fetchWttr('', { lat: 31.8639, lon: 117.2808, days: 7 });
  assert(calls[0].includes('wttr.in/31.8639,117.2808'), 'wttr 用坐标写法（' + calls[0] + '）');
  assert(wttr.place === '这里', 'wttr 没城市名时 place 为「这里」');

  // ── 5. providers 把 opts.lat/lon 原样交给 provider ─────────────────
  let seenOpts = null;
  registerProvider('stub-coords', async (city, opts) => {
    seenOpts = { city, ...opts };
    return { place: city, now: { temp: 10 }, days: [] };
  });
  process.env.DSH_WEATHER_PROVIDER = 'stub-coords';
  await fetchWeather('合肥', { lat: 31.8639, lon: 117.2808, days: 2 });
  assert(seenOpts.lat === 31.8639 && seenOpts.lon === 117.2808 && seenOpts.days === 2, 'provider 收到 lat/lon/days');
  delete process.env.DSH_WEATHER_PROVIDER;

  // ── 6. resolvePlace：坐标只在家（没显式给城市）时生效 ─────────────────
  await saveProfile({ city: '合肥', lat: 31.8639, lon: 117.2808 });
  const home1 = await resolvePlace();
  assert(home1.city === '合肥' && home1.lat === 31.8639, '没传城市 → 用 profile 的坐标');
  const away = await resolvePlace('上海');
  assert(away.city === '上海' && away.lat === null && away.lon === null, '显式传城市 → 不拿家里的坐标去查');

  // 只有坐标没有城市：city 用「这里」
  await saveProfile({ city: '', lat: 31.8639, lon: 117.2808 }, { clear: ['city'] });
  const coordOnly = await resolvePlace();
  assert(coordOnly.city === '这里' && coordOnly.lat === 31.8639, '只有坐标时 city 用「这里」');

  // ── 7. 出差时不能把家里的坐标带去查出差城市 ──────────────────────────
  const until = new Date();
  until.setDate(until.getDate() + 2);
  const ymd = until.getFullYear() + '-' + String(until.getMonth() + 1).padStart(2, '0') + '-' + String(until.getDate()).padStart(2, '0');
  await saveProfile({ city: '合肥', lat: 31.8639, lon: 117.2808, travelCity: '上海', travelUntil: ymd });
  const traveling = await effectiveProfile();
  assert(traveling.city === '上海' && traveling.lat === undefined, '出差期间丢掉家的坐标，按出差城市解析');
  await saveProfile({}, { clear: ['travelCity', 'travelUntil'] });

  // ── 8. weather_profile：location 粘贴串 / 只给一半报错 / describe 回显 ──
  await saveProfile({}, { clear: ['lat', 'lon', 'city'] });
  const box = { register: (tool) => { box.tool = tool; } };
  const { register } = await import('../lib/tools/profile.js');
  register({ tools: box });
  const tool = box.tool;
  const patchProps = tool.parameters.properties.patch.properties;
  assert('location' in patchProps, 'schema 里有 location');
  assert(patchProps.lat.type === 'number' && patchProps.lon.type === 'number', 'schema 里有 lat/lon');

  const parsed = await tool.execute({ action: 'set', patch: { city: '合肥', location: '31.8639,117.2808' } });
  assert(parsed.text.includes('31.8639, 117.2808（自定义）'), 'describe 回显自定义坐标（' + parsed.text + '）');
  const stored = await loadProfile();
  assert(stored.lat === 31.8639 && stored.lon === 117.2808, 'location 落成 lat/lon');

  let half = '';
  try { await tool.execute({ action: 'set', patch: { lat: 31.8 } }); } catch (e) { half = e.message; }
  assert(/成对/.test(half), '只给 lat 不给 lon → 报错（' + half + '）');

  let badLoc = '';
  try { await tool.execute({ action: 'set', patch: { location: '合肥' } }); } catch (e) { badLoc = e.message; }
  assert(/只认「纬度,经度」/.test(badLoc), 'location 格式不对 → 说清格式');

  let badRange = '';
  try { await tool.execute({ action: 'set', patch: { lat: 100, lon: 117 } }); } catch (e) { badRange = e.message; }
  assert(/超出范围/.test(badRange), '坐标越界 → 报错');

  // ── 9. 城市名解析出来的坐标会记住，describe 能回显来源 ─────────────────
  await saveProfile({}, { clear: ['lat', 'lon', 'city'] });
  await saveProfile({ city: '合肥' });
  await rememberGeocode('合肥', 31.864, 117.281);
  const cached = await cachedCoords('合肥');
  assert(cached.lat === 31.864 && cached.lon === 117.281, 'geocode 缓存能读回');
  const getOut = await tool.execute({ action: 'get' });
  assert(getOut.text.includes('31.864, 117.281（由城市名解析：合肥）'), 'describe 回显由城市名解析的坐标（' + getOut.text + '）');
  assert(getOut.text.includes('当前偏好'), 'get 仍然给出偏好主行');

  // ── 10. 清理 ─────────────────────────────────────────────────────
  globalThis.fetch = realFetch;
  rmSync(home, { recursive: true, force: true });
  delete process.env.DSH_HOME;

  nodeAssert.equal(total(), 37, '断言总数 37')
})
