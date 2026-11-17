// 日历传感器：今天是不是节日或节气。
// 只回答「今天是什么日子」；别人的生日寄在提醒里，由 care_brief 当 extras 带上。
import { festivalOf } from '../../festivals.js'

/**
 * @param {{ now?: Date }} [input]
 * @returns {Array<{ topic: string, weight: number, confidence: number, text: string, hint: string }>}
 */
export function collectCalendarSignals({ now = new Date() } = {}) {
  const festival = festivalOf(now)
  if (!festival || !festival.name) return []
  const isFestival = festival.kind === 'festival'
  return [{
    topic: 'calendar',
    weight: isFestival ? 55 : 30,
    confidence: 1,
    text: `今天是${festival.name}`,
    hint: isFestival ? (festival.note || '') : '',
  }]
}
