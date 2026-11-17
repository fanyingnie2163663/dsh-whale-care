// dsh-whale-care — dsh 适配层：只做接线，8 个工具在 lib/tools/ 各管各的。
// 纯逻辑在 ../weather.js、../care.js、../reminders.js 等，可脱离 dsh 单独使用。

import { register as register1 } from './tools/weather.js';
import { register as register2 } from './tools/care.js';
import { register as register3 } from './tools/profile.js';
import { register as register4 } from './tools/reminder.js';
import { register as register5 } from './tools/mood.js';
import { register as register6 } from './tools/card.js';
import { register as register7 } from './tools/alert.js';
import { register as register8 } from './tools/care-brief.js';

export const name = 'whale-care';
export const inject = ['tools'];

export function apply(ctx) {
  register1(ctx);
  register2(ctx);
  register3(ctx);
  register4(ctx);
  register5(ctx);
  register6(ctx);
  register7(ctx);
  register8(ctx);
}
