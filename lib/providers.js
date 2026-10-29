// 天气源（provider）抽象层：上层只认 fetchWeather(city, opts) 返回的固定形状，
// 具体从哪拿数据可以换——内置 wttr 与 open-meteo，也支持第三方自定义模块。
//
// 契约（任何 provider 都必须满足）：
//   async function fetchWeather(city: string, opts?: { days?: 1..3 }) => {
//     place: string,
//     now: { temp, feels, desc, humidity, wind, visibility, uv },   // 数字单位：°C / % / km/h / km
//     air: { aqi, pm25 } | null,
//     days: [{ label, date, min, max, desc, rain, wind, precip,
//              hours: { h9, h12, h15, h18, h21 } }],              // rain=概率% wind=km/h precip=mm
//     fetchedAt: number
//   }
//
// 选择顺序：
//   1. 环境变量 DSH_WEATHER_PROVIDER（wttr | openmeteo | custom）
//   2. $DSH_HOME/whale-weather/config.json 的 provider
//   3. 默认 wttr
// 失败时按 fallback 列表依次重试（默认 wttr → openmeteo）。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { fetchWttr } from './weather.js';
import { fetchOpenMeteo } from './openmeteo.js';

const builtins = new Map([
  ['wttr', fetchWttr],
  ['openmeteo', fetchOpenMeteo],
]);

const customProviders = new Map();
let loadedCustomModule = null;

export function registerProvider(name, fn) {
  if (typeof fn !== 'function') throw new Error('provider 必须是 async function');
  customProviders.set(String(name), fn);
}

export function listProviders() {
  return [...new Set([...builtins.keys(), ...customProviders.keys(), 'custom'])];
}

export function providersConfigPath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'config.json');
}

export async function loadProviderConfig() {
  let fileCfg = {};
  try {
    fileCfg = JSON.parse(await readFile(providersConfigPath(), 'utf8')) || {};
  } catch { fileCfg = {}; }
  const envChain = String(process.env.DSH_WEATHER_FALLBACK || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return {
    provider: String(process.env.DSH_WEATHER_PROVIDER || fileCfg.provider || 'wttr').trim(),
    fallback: envChain.length
      ? envChain
      : (Array.isArray(fileCfg.fallback) ? fileCfg.fallback.map(String) : ['openmeteo']),
    customModule: String(process.env.DSH_WEATHER_PROVIDER_MODULE || fileCfg.customModule || '').trim(),
  };
}

async function loadCustomModule(modulePath) {
  if (!modulePath) return null;
  if (loadedCustomModule && loadedCustomModule.path === modulePath) return loadedCustomModule.fn;
  const mod = await import(pathToFileURL(modulePath).href);
  const fn = mod?.fetchWeather ?? mod?.default?.fetchWeather ?? mod?.default;
  if (typeof fn !== 'function') throw new Error(`自定义天气模块 ${modulePath} 没有导出 fetchWeather`);
  loadedCustomModule = { path: modulePath, fn };
  return fn;
}

function resolveProvider(name, customFn) {
  if (name === 'custom') {
    if (!customFn) throw new Error('provider=custom 但没有配置 customModule');
    return customFn;
  }
  if (customProviders.has(name)) return customProviders.get(name);
  if (builtins.has(name)) return builtins.get(name);
  throw new Error(`未知的天气源「${name}」，可用：${listProviders().join(' / ')}`);
}

export async function fetchWeather(city, opts = {}) {
  const cfg = await loadProviderConfig();
  let customFn = null;
  if (cfg.customModule) {
    try { customFn = await loadCustomModule(cfg.customModule); } catch (error) {
      // 自定义模块加载失败不致命：继续走内置源
      if (cfg.provider === 'custom') throw error;
    }
  }
  const chain = [...new Set([cfg.provider, ...(cfg.fallback || [])].filter(Boolean))];
  const errors = [];
  for (const name of chain) {
    let fn;
    try { fn = resolveProvider(name, customFn); } catch (error) { errors.push(`${name}: ${error.message}`); continue; }
    try {
      const data = await fn(city, opts);
      return { ...data, provider: data.provider || name };
    } catch (error) {
      errors.push(`${name}: ${error?.message ?? error}`);
    }
  }
  throw new Error(`所有天气源都失败了（${errors.join('；')}）`);
}
