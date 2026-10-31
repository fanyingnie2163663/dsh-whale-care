// 离线单测：天气源选择与降级。
// 重点验证「残缺结构」会被当成失败，让 fallback 继续试下一个源，
// 而不是把 {} 一路传到话术层。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = mkdtempSync(path.join(os.tmpdir(), 'whale-prov-'));
process.env.DSH_HOME = home;
mkdirSync(path.join(home, 'whale-weather'), { recursive: true });

const cfgPath = path.join(home, 'whale-weather', 'config.json');
const writeCfg = (cfg) => writeFileSync(cfgPath, JSON.stringify(cfg), { mode: 0o600 });

const goodPath = path.join(home, 'good.mjs');
writeFileSync(
  goodPath,
  "export async function fetchWeather(city) { return { place: city, now: { temp: 20, desc: '晴' }, days: [{ min: 10, max: 20, desc: '晴', rain: 0, wind: 5 }] }; }\n",
);
const badPath = path.join(home, 'bad.mjs');
writeFileSync(badPath, 'export async function fetchWeather() { return {}; }\n');

const { fetchWeather, listProviders } = await import('../lib/providers.js');

const assert = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) process.exitCode = 1;
};

assert(listProviders().includes('wttr') && listProviders().includes('openmeteo') && listProviders().includes('custom'), '内置源与 custom 都在列表里');

// 1) 自定义源返回完整结构 → 正常返回
writeCfg({ provider: 'custom', customModule: goodPath, fallback: [] });
const ok = await fetchWeather('测试城');
assert(ok.place === '测试城' && ok.provider === 'custom', '自定义源正常返回，provider 标记为 custom');
assert(Array.isArray(ok.days) && ok.days.length === 1, '返回的 days 结构完整');

// 2) 自定义源返回 {} → 视为失败，不再往下传
writeCfg({ provider: 'custom', customModule: badPath, fallback: [] });
let msg = '';
try { await fetchWeather('X'); } catch (e) { msg = e.message; }
assert(/结构不完整/.test(msg), '空对象被判定为「返回结构不完整」');
assert(/所有天气源都失败了/.test(msg), '失败信息汇总为「所有天气源都失败了」');

// 3) 未知 provider → 按 fallback 链继续
writeCfg({ provider: 'bogus', customModule: goodPath, fallback: ['custom'] });
const fallback = await fetchWeather('Y');
assert(fallback.provider === 'custom', '未知 provider 会降级到 fallback 链里的 custom');

// 4) custom 但没配模块 → 明确报错
process.env.DSH_WEATHER_PROVIDER = 'custom';
delete process.env.DSH_WEATHER_PROVIDER_MODULE;
writeCfg({ provider: 'custom', fallback: [] });
let msg2 = '';
try { await fetchWeather('Z'); } catch (e) { msg2 = e.message; }
assert(/customModule|custom/i.test(msg2), 'provider=custom 缺模块时给出可读错误');
delete process.env.DSH_WEATHER_PROVIDER;

try { rmSync(home, { recursive: true, force: true }); } catch {}
delete process.env.DSH_HOME;
