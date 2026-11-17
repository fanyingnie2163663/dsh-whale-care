// weather_profile：用户偏好档案的读写
import { defineTool } from '@deepseek-ai/dsh-tools';
import { effectiveProfile, loadProfile, saveProfile, describeProfile, dateKey } from '../profile.js';
import { TEXT_OUT } from './shared.js';

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_profile',
      description: '读取或修改天气关心用的用户偏好：城市、称呼、是否怕冷/怕热、出行方式、是否随身带伞、健康备注（如鼻炎、带娃），以及每天早上那条主动关心的开关（dailyCare）和固定发送时间（careTime）。出差/旅行时用 travelCity + travelUntil 临时换城市（到 travelUntil 当天为止），默认城市不变；把 travelCity 传空字符串可取消。这些会改变 weather_care 的措辞、提醒阈值和主动push。第一次使用时建议先问用户再设置。装好插件后先 action=get 看一眼：返回里若带「印象（来自 xxx）」，说明本机有别的插件存过这个人的偏好（如 qq-bridge 的群友印象），直接参考那些线索、别重复问同一件事；没有就正常问。action=get 读取；action=set 时用 patch 传要改的字段。',
      parameters: {
        action: { type: 'string', required: true, description: 'get 或 set' },
        patch: {
          type: 'object',
          additionalProperties: false,
          description: 'action=set 时要修改的字段：{ city, travelCity, travelUntil, nickname, coldSensitive, heatSensitive, commute(walk|bike|transit|drive|none), hasUmbrella, notes, dailyCare, careTime }',
          properties: {
            city: { type: 'string', description: '默认城市' },
            travelCity: { type: 'string', description: '出差/临时所在城市；传空字符串取消' },
            travelUntil: { type: 'string', description: '临时城市用到哪天 YYYY-MM-DD；只设 travelCity 时默认 3 天' },
            nickname: { type: 'string', description: '希望被怎么称呼' },
            coldSensitive: { type: 'boolean', description: '是否怕冷' },
            heatSensitive: { type: 'boolean', description: '是否怕热' },
            commute: { type: 'string', description: 'walk | bike | transit | drive | none' },
            hasUmbrella: { type: 'boolean', description: '是否随身带伞' },
            notes: { type: 'string', description: '健康备注，如「有鼻炎」' },
            dailyCare: { type: 'boolean', description: '每天早上主动发一条天气关心；false = 关掉（说「别每天发了」时用）' },
            careTime: { type: 'string', description: '每天发关心的时刻，24 小时制 HH:MM（如 07:45）；不设 = 跟着作息自适应' },
          },
        },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        if (String(args?.action ?? '').toLowerCase() === 'set') {
          const raw = { ...args?.patch };
          const clear = [];
          for (const key of ['travelCity', 'travelUntil']) {
            const v = raw[key];
            if (v === undefined || v === null) { delete raw[key]; continue; }
            const text = String(v).trim();
            if (text === '' || ['off', 'none', '取消', '结束'].includes(text.toLowerCase())) {
              clear.push(key);
              delete raw[key];
            }
          }
          if (raw.travelCity && !raw.travelUntil) {
            const until = new Date();
            until.setDate(until.getDate() + 3);
            raw.travelUntil = dateKey(until);
          }
          if (raw.travelUntil && !raw.travelCity && !clear.includes('travelCity')) {
            const current = await loadProfile();
            if (!current.travelCity) throw new Error('设置 travelUntil 时也要给 travelCity');
          }
          const saved = await saveProfile(raw, { clear });
          return { text: `已更新偏好：${describeProfile(saved)}` };
        }
        const profile = await effectiveProfile();
        return { text: `当前偏好：${describeProfile(profile)}` };
      },
    }));
}
