// 不依赖 dsh 的演示脚本：node scripts/demo.mjs 合肥
import { buildWeatherReport } from '../lib/weather.js';

const city = process.argv[2] || '合肥';
const days = Number(process.argv[3] || 3);

try {
  console.log(await buildWeatherReport(city, { days }));
} catch (error) {
  console.error('查询失败：', error?.message ?? error);
  process.exit(1);
}
