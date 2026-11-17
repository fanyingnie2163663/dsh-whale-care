// 不依赖 dsh 的演示脚本：
//   node scripts/demo.mjs                          # 详细播报（城市取 profile.json 里的 city）
//   node scripts/demo.mjs <城市>                   # 详细播报（临时指定城市）
//   node scripts/demo.mjs <城市> care              # 关心版（默认偏好）
//   node scripts/demo.mjs <城市> care '{"nickname":"阿宁","coldSensitive":true,"commute":"bike"}'
import { formatDetailed } from '../lib/weather.js';
import { fetchWeather } from '../lib/providers.js';
import { buildCareBrief } from '../lib/care.js';
import { loadProfile, profilePath } from '../lib/profile.js';

// 这里不许有「默认城市」：地址是每个人自己的，没设就直说没设，别偷偷替用户决定。
async function resolveCity() {
  const arg = String(process.argv[2] ?? '').trim();
  if (arg) return arg;
  const profile = await loadProfile();
  const city = String(profile?.city ?? '').trim();
  if (city) return city;
  console.error('没有城市：要么在参数里给一个，要么先设默认城市（' + profilePath() + ' 里的 city）。');
  console.error('用法：node scripts/demo.mjs [城市] [care] [偏好JSON]');
  process.exit(1);
  return '';
}

const city = await resolveCity();
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
