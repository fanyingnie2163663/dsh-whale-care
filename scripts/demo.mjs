// 不依赖 dsh 的演示脚本：
//   node scripts/demo.mjs 合肥                 # 详细播报
//   node scripts/demo.mjs 合肥 care            # 关心版（默认偏好）
//   node scripts/demo.mjs 合肥 care '{"nickname":"阿宁","coldSensitive":true,"commute":"bike"}'
import { fetchWeather, formatDetailed } from '../lib/weather.js';
import { buildCareBrief } from '../lib/care.js';

const city = process.argv[2] || '合肥';
const mode = process.argv[3] || 'detail';
const profileArg = process.argv[4];

try {
  const data = await fetchWeather(city, { days: 3 });
  if (mode === 'care') {
    const profile = profileArg ? JSON.parse(profileArg) : {};
    console.log(buildCareBrief(data, profile));
  } else {
    console.log(formatDetailed(data));
  }
} catch (error) {
  console.error('查询失败：', error?.message ?? error);
  process.exit(1);
}
