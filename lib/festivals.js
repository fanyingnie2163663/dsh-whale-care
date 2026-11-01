// 节日 / 节气：给每日关心加一句"今天是什么日子"。
//
// 只收录能确定日期的：
//   · 公历固定节日（元旦、情人节、劳动节、国庆、圣诞…）；
//   · 2026–2027 的农历大节（除夕/春节/元宵/端午/中秋），按公开日历；
//   · 2026–2027 的二十四节气（紫金山天文台历表）。
// 没有把握的（七夕、重阳、腊八）先不写——宁可不提，也不说错日子。
//
// 纯函数，不联网；日期都按本地时区。

const pad2 = (n) => String(n).padStart(2, '0');
const keyOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

// 公历固定节日（MM-DD）
const FIXED = {
  '01-01': { name: '元旦', note: '新年第一天，图个好彩头' },
  '02-14': { name: '情人节', note: '有伴的话，别忘了表示一下' },
  '03-08': { name: '妇女节', note: '记得跟身边的女性说声节日快乐' },
  '05-01': { name: '劳动节', note: '能歇就歇一天' },
  '06-01': { name: '儿童节', note: '谁还不是个小朋友' },
  '09-10': { name: '教师节', note: '给老师发条消息' },
  '10-01': { name: '国庆节', note: '人多，出门注意安全' },
  '12-24': { name: '平安夜', note: '平平安安就好' },
  '12-25': { name: '圣诞节', note: '凑个热闹' },
};

// 2026–2027 的农历大节（按公开日历；除夕=春节前一天）
const LUNAR = {
  '2026-02-16': { name: '除夕', note: '一年到头，吃顿好的' },
  '2026-02-17': { name: '春节', note: '新年好，万事顺遂' },
  '2026-03-03': { name: '元宵节', note: '记得吃碗汤圆' },
  '2026-06-19': { name: '端午节', note: '粽子别吃太多，糯米不好消化' },
  '2026-09-25': { name: '中秋节', note: '月亮圆了，记得吃块月饼' },
  '2027-02-05': { name: '除夕', note: '一年到头，吃顿好的' },
  '2027-02-06': { name: '春节', note: '新年好，万事顺遂' },
  '2027-02-20': { name: '元宵节', note: '记得吃碗汤圆' },
  '2027-06-09': { name: '端午节', note: '粽子别吃太多，糯米不好消化' },
  '2027-09-15': { name: '中秋节', note: '月亮圆了，记得吃块月饼' },
};

// 二十四节气（2026–2027，紫金山天文台历表；只取日期，不取时刻）
const TERMS = {
  2026: [
    ['01-05', '小寒'], ['01-20', '大寒'], ['02-04', '立春'], ['02-18', '雨水'],
    ['03-05', '惊蛰'], ['03-20', '春分'], ['04-05', '清明'], ['04-20', '谷雨'],
    ['05-05', '立夏'], ['05-21', '小满'], ['06-05', '芒种'], ['06-21', '夏至'],
    ['07-07', '小暑'], ['07-23', '大暑'], ['08-07', '立秋'], ['08-23', '处暑'],
    ['09-07', '白露'], ['09-23', '秋分'], ['10-08', '寒露'], ['10-23', '霜降'],
    ['11-07', '立冬'], ['11-22', '小雪'], ['12-07', '大雪'], ['12-22', '冬至'],
  ],
  2027: [
    ['01-05', '小寒'], ['01-20', '大寒'], ['02-04', '立春'], ['02-19', '雨水'],
    ['03-06', '惊蛰'], ['03-21', '春分'], ['04-05', '清明'], ['04-20', '谷雨'],
    ['05-06', '立夏'], ['05-21', '小满'], ['06-06', '芒种'], ['06-21', '夏至'],
    ['07-07', '小暑'], ['07-23', '大暑'], ['08-08', '立秋'], ['08-23', '处暑'],
    ['09-08', '白露'], ['09-23', '秋分'], ['10-08', '寒露'], ['10-23', '霜降'],
    ['11-07', '立冬'], ['11-22', '小雪'], ['12-07', '大雪'], ['12-22', '冬至'],
  ],
};

// 清明既是节日也是节气，带一句更具体的
const SPECIAL = {
  '04-05': { name: '清明节', note: '扫墓或踏青，路上慢一点' },
};

function nthWeekdayOfMonth(year, month, weekday, n) {
  // weekday: 0=周日 … 6=周六；n=第几个（1 起）
  const first = new Date(year, month - 1, 1);
  const delta = (weekday - first.getDay() + 7) % 7;
  return 1 + delta + (n - 1) * 7;
}

/**
 * 取某天的节日/节气。
 * @returns {{key:string,name:string,note:string,kind:'festival'|'term'}|null}
 */
export function festivalOf(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const key = keyOf(y, m, d);
  const md = key.slice(5);

  const fest = LUNAR[key] || SPECIAL[md] || FIXED[md];
  if (fest) return { key, name: fest.name, note: fest.note || '', kind: 'festival' };

  // 母亲节：5 月第二个周日；父亲节：6 月第三个周日
  if (m === 5 && d === nthWeekdayOfMonth(y, 5, 0, 2)) {
    return { key, name: '母亲节', note: '给妈妈打个电话', kind: 'festival' };
  }
  if (m === 6 && d === nthWeekdayOfMonth(y, 6, 0, 3)) {
    return { key, name: '父亲节', note: '给爸爸发条消息', kind: 'festival' };
  }

  const term = (TERMS[y] || []).find(([day]) => day === md);
  if (term) return { key, name: term[1], note: '', kind: 'term' };
  return null;
}

/** 给每日关心用的一句话；没有节日/节气返回 ''。 */
export function festivalLine(festival) {
  if (!festival || !festival.name) return '';
  if (festival.kind === 'term') return `今天是${festival.name}。`;
  return `今天是${festival.name}${festival.note ? `，${festival.note}` : ''}。`;
}

export const FESTIVAL_TABLE = { FIXED, LUNAR, TERMS, SPECIAL };
