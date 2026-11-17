// weather_card：生成 SVG 天气卡片（period=day 单日卡 / period=week 每周回顾卡）
import { defineTool } from '@deepseek-ai/dsh-tools';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWeather } from '../providers.js';
import { fetchOpenMeteo } from '../openmeteo.js';
import { effectiveProfile } from '../profile.js';
import { buildWeatherCardSvg } from '../card.js';
import { buildWeeklyCardSvg } from '../card-week.js';
import { buildWeeklyReview } from '../weekly.js';
import { loadWeeklyUsage } from '../usage.js';
import { buildCareBrief } from '../care.js';
import { loadMoods } from '../mood.js';
import { loadReminders, remindersForDay } from '../reminders.js';
import { TEXT_OUT, resolvePlace, cardDir } from './shared.js';

async function writeCard(prefix, svg) {
  const dir = cardDir();
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${prefix}-${Date.now()}.svg`);
  await writeFile(file, svg, 'utf8');
  return file;
}

// 周卡的一句话摘要：只说数据里真有的（不自造结论）
function weeklySummary(review) {
  const bits = [`第 ${review.week.number} 周 · ${review.week.label}`];
  const hottest = review.weather.extremes.hottest;
  if (hottest) bits.push(`最暖 ${hottest.weekday} ${Math.round(hottest.value)}°`);
  const coldest = review.weather.extremes.coldest;
  if (coldest) bits.push(`最低 ${coldest.weekday} ${Math.round(coldest.value)}°`);
  if (review.mood.recordedDays) bits.push(`情绪记录 ${review.mood.recordedDays} 天`);
  if (review.usage?.tokens != null) bits.push(`本周 ${review.usage.tokens} tokens`);
  return bits.join(' · ');
}

export function register(ctx) {
    ctx.tools.register(defineTool({
      name: 'weather_card',
      description: '生成一张天气卡片（720×980，SVG）。period=day（默认）是单日卡：当前温度、今天区间、降雨/风力/空气、穿衣与带伞建议；period=week 是每周回顾卡：本周 7 天温度带、周一到今天的情绪线、本周剩余提醒、本周 token 用量（7 天温度带需要能给 7 天的源，如 open-meteo；源只给 3 天时会退化成一条区间条，其余照常）。返回本地文件路径；要发到 QQ 时把它交给 qq_send_image（QQ 侧会转成 PNG）。用户说「来张天气卡片/天气图」用 day，「周卡/每周回顾/这周总结」用 week。',
      parameters: {
        city: { type: 'string', description: '城市；不传则用 profile 里的默认城市（出差期间自动用出差城市）' },
        period: {
          type: 'string',
          enum: ['day', 'week'],
          description: "卡的类型：'day' 单日卡（默认）；'week' 每周回顾卡（7 天天气 + 本周情绪 + 剩余提醒 + 本周 token 用量）",
        },
      },
      output: TEXT_OUT,
      isConcurrencySafe: () => true,
      async execute(args) {
        const { city, lat, lon } = await resolvePlace(args?.city);
        const now = new Date();
        const period = args?.period === 'week' ? 'week' : 'day';

        if (period === 'week') {
          // 周卡要 7 天预报 + 情绪 + 提醒 + 用量；取不到的部分各自降级，不影响整张卡
          const [profile, moods, reminders, usage] = await Promise.all([
            effectiveProfile(),
            loadMoods(),
            loadReminders(),
            loadWeeklyUsage({ now }),
          ]);
          let data = await fetchWeather(city, { days: 7, lat, lon });
          // 默认源是 wttr，它只有 3 天，画不出温度带：周卡这一条路上单独再试一次 open-meteo
          // （不改全局 provider 默认链；仍拿不到 4 天以上就按 §8.4 退化成区间条）。
          if (!Array.isArray(data?.days) || data.days.length < 4) {
            try {
              const detailed = await fetchOpenMeteo(city, { days: 7, lat, lon });
              if (Array.isArray(detailed?.days) && detailed.days.length > (data?.days?.length ?? 0)) data = detailed;
            } catch {
              // open-meteo 也不通就用手上这份（3 天 → 区间条）
            }
          }
          const review = buildWeeklyReview({ data, moods, profile, usage, now });
          const svg = buildWeeklyCardSvg(review, profile, { now, reminders });
          const file = await writeCard('week-card', svg);
          return { text: `每周回顾卡已生成：${file}\n${weeklySummary(review)}` };
        }

        const [data, profile] = await Promise.all([fetchWeather(city, { lat, lon }), effectiveProfile()]);
        const svg = buildWeatherCardSvg(data, profile, { now });
        const file = await writeCard('weather', svg);
        const brief = buildCareBrief(data, profile, { reminders: remindersForDay(await loadReminders()) });
        return { text: `天气卡片已生成：${file}\n\n${brief}` };
      },
    }));
}
