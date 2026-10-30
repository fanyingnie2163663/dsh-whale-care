// 极端天气预警：不依赖官方预警接口，用预报数据按阈值分级（黄/橙/红），
// 和提醒引擎共用同一套"到点才评估、当天不重复"的思路。
//
// 注意：这是基于预报的**本地估算**，不是气象台发布的正式预警；
// 文案里会写清楚"预报推算"，避免让用户以为是官方发布。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const LEVEL_ORDER = { 黄: 1, 橙: 2, 红: 3 };

export function alertsStatePath() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'whale-weather', 'alerts-fired.json');
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const num = (x) => {
  const n = Number(String(x ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function levelFor(value, yellow, orange, red) {
  if (value >= red) return '红';
  if (value >= orange) return '橙';
  if (value >= yellow) return '黄';
  return null;
}

/**
 * @param {{days:Array, now:object, air:object|null}} data fetchWeather 的结果
 * @returns {Array<{id,type,level,title,detail,advice,dayLabel}>}
 */
export function evaluateAlerts(data) {
  const out = [];
  const days = Array.isArray(data?.days) ? data.days.slice(0, 3) : [];
  const cur = data?.now ?? {};
  const push = (type, level, dayLabel, title, detail, advice) => {
    out.push({
      id: `${type}-${dayLabel}-${level}`,
      type, level, title, detail, advice, dayLabel,
    });
  };

  for (const d of days) {
    const label = d.label ?? d.date ?? '';
    // 暴雨（按全天降水量估算）
    const rainLevel = levelFor(num(d.precip), 25, 50, 100);
    if (rainLevel) {
      push('rain', rainLevel, label, `${label}暴雨${rainLevel}色预警`,
        `预计降水约 ${Math.round(num(d.precip))}mm（降雨概率 ${d.rain}%）`,
        d.precip >= 50 ? '尽量别去低洼地段和地下车库，出门带伞并留意积水' : '出门带伞，避开积水路段');
    }
    // 大风
    const windLevel = levelFor(num(d.wind), 50, 62, 75);
    if (windLevel) {
      push('wind', windLevel, label, `${label}大风${windLevel}色预警`,
        `阵风约 ${Math.round(num(d.wind))}km/h`,
        '远离广告牌和临时搭建物，骑车注意侧风，高空作业先停');
    }
    // 高温
    const heatLevel = levelFor(num(d.max), 35, 37, 40);
    if (heatLevel) {
      push('heat', heatLevel, label, `${label}高温${heatLevel}色预警`,
        `最高 ${d.max}°C`,
        '避开正午外出，多喝水，别把人和宠物留在车里');
    }
    // 低温 / 寒潮
    const coldLevel = d.min <= -20 ? '红' : d.min <= -10 ? '橙' : null;
    if (coldLevel) {
      push('cold', coldLevel, label, `${label}低温${coldLevel}色预警`,
        `最低 ${d.min}°C`,
        '注意防冻，水管和宠物都要顾到，老人小孩少出门');
    }
    // 雷电
    if (/雷/.test(String(d.desc ?? ''))) {
      push('thunder', '黄', label, `${label}雷电黄色预警`,
        `天气现象：${d.desc}`,
        '别在大树下和空旷高地停留，室内拔掉不必要的电源');
    }
    // 沙尘
    if (/沙|尘/.test(String(d.desc ?? ''))) {
      push('dust', '黄', label, `${label}沙尘黄色预警`,
        `天气现象：${d.desc}`,
        '关好门窗，出门戴口罩和眼镜');
    }
  }

  // 寒潮：24 小时内最高温骤降
  if (days.length >= 2) {
    const drop = num(days[0].max) - num(days[1].max);
    const lv = levelFor(drop, 8, 12, 16);
    if (lv) {
      push('coldwave', lv, '明天', `寒潮${lv}色预警（明天）`,
        `明天最高 ${days[1].max}°C，比今天低 ${Math.round(drop)}°C`,
        '提前把厚衣服拿出来，夜里关好窗');
    }
  }

  // 大雾（当前能见度）
  if (cur.visibility > 0 && cur.visibility <= 1) {
    const lv = cur.visibility <= 0.5 ? '橙' : '黄';
    push('fog', lv, '现在', `大雾${lv}色预警`,
      `能见度约 ${cur.visibility}km`,
      '开车开雾灯、减速，骑车和步行靠边');
  }

  // 空气重污染
  if (data?.air?.aqi != null) {
    const lv = levelFor(num(data.air.aqi), 100, 150, 200);
    if (lv) {
      push('aqi', lv, '现在', `空气污染${lv}色预警`,
        `AQI ${data.air.aqi}${data.air.pm25 != null ? `，PM2.5 ${Math.round(data.air.pm25)}μg/m³` : ''}`,
        '关窗、开净化器，出门戴 N95');
    }
  }

  // 去重（同 id 只留最高等级那条）
  const byId = new Map();
  for (const a of out) {
    const prev = byId.get(a.id);
    if (!prev || LEVEL_ORDER[a.level] > LEVEL_ORDER[prev.level]) byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);
}

export function formatAlert(alert = {}) {
  const mark = alert.level === '红' ? '🔴' : alert.level === '橙' ? '🟠' : '🟡';
  const title = alert.title ?? '天气提醒';
  const detail = alert.detail ? `：${alert.detail}` : '';
  const advice = alert.advice ? `。${alert.advice}` : '';
  return `${mark} ${title}${detail}${advice}。`;
}

export async function loadFiredAlerts() {
  try {
    const parsed = JSON.parse(await readFile(alertsStatePath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveFiredAlerts(map) {
  const file = alertsStatePath();
  await mkdir(path.dirname(file), { recursive: true });
  const today = todayKey();
  const kept = Object.fromEntries(Object.entries(map).filter(([, day]) => day === today));
  await writeFile(file, JSON.stringify(kept, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  return kept;
}
