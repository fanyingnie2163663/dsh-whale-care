// 关心层：传感器 → 判断 → 说话，三层串起来。
//
// 分工：
//   · engine/sensors/care.js   只回答「今天哪些事值得说、各有多重要」，阈值与互斥都在那里；
//   · engine/judge.js          去重、按权重排序、只留前三；
//   · engine/voice.js          把选中的信号和上下文说成一段像人说的话。
// 这里不再放文案和阈值——改造前的逐字输出由 voice 原样保留，test/care-golden.test.js 锁着它。
//
// 设计原则（保留）：先给结论（现在怎么样），再给 1~3 个真正影响今天的提醒，最后一句收尾；
// 提醒按"对这个人影响大小"排序，不是把规则全倒出来；
// 称呼、怕冷/怕热、出行方式、有没有伞、备注（如鼻炎）都会改变措辞与阈值；
// 不制造焦虑：最多一条"担心"，其余都是可执行的小事。

import { careFrame, collectCareSignals, peakRainHour } from './engine/sensors/care.js';
import { judge } from './engine/judge.js';
import { commuteText, outfitFor, renderCareBrief } from './engine/voice.js';

// 公开 API 不变：./care 子路径与 lib/card.js 都还用 outfitFor / peakRainHour。
export { outfitFor, peakRainHour };

/**
 * @param {{place?:string, now?:object, air?:object|null, days?:Array}} [data]  fetchWeather 的结果（可能残缺）
 * @param {object} [profile]  用户偏好（见 profile.js）
 * @param {{now?:Date, reminders?:Array, festival?:object|false}} [opts]
 *   reminders: 今天要提醒的事（[{time,label}] 或字符串）；由宿主传入
 *   festival: 传 false 不报节日；不传则按日期自动查
 * @returns {string} 一段可直接发给用户的话
 */
export function buildCareBrief(data = {}, profile = {}, { now = new Date(), reminders = null, festival = undefined } = {}) {
  // 天气源偶尔会返回残缺结构（接口抽风、字段改名）。sensors 一律降级、不抛错：
  // 宁可少说一句，也不要让桥接的直发路径崩掉、或者把 "undefined°C" 发给用户。
  const frame = careFrame(data, now);
  const { chosen } = judge(collectCareSignals(frame, profile), { limit: 3 });
  return renderCareBrief({ frame, profile, now, reminders, festival, signals: chosen });
}

/** 给 agent 看的"关心要点"（结构化），便于它在回复里自由发挥而不是照读 */
export function careHighlights(data, profile = {}, { now = new Date() } = {}) {
  const brief = buildCareBrief(data, profile, { now });
  const hour = now.getHours();
  const items = [];
  if (profile.coldSensitive) items.push('用户怕冷');
  if (profile.heatSensitive) items.push('用户怕热');
  if (profile.commute) items.push(`出行方式：${commuteText(profile.commute)}`);
  if (profile.notes) items.push(`备注：${profile.notes}`);
  return {
    brief,
    hour,
    sendsAt: hour < 11 ? '早上' : hour < 18 ? '白天' : '晚上',
    profileHints: items,
  };
}
