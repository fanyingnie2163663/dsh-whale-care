# dsh-whale-care · 小鲸鱼关心

![version](https://img.shields.io/badge/version-0.5.7-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![dsh](https://img.shields.io/badge/dsh-0.1.2_to_0.2.x-6f42c1)
![no api key](https://img.shields.io/badge/API%20key-not%20required-brightgreen)
![node](https://img.shields.io/badge/node-22_%2F_24-339933)

> 当前版本 **0.5.7**（早期版本，功能还在加）。

给 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的**关心引擎**：教 agent 怎么真正关心一个人，而不是把一堆数据倒给对方。

具体做法就是两件事：**先算清楚，再用对方听得进去的方式说一句**。天气是第一个关心来源——最便宜、最直接，冷暖下雨每天都用得上；以后接作息、吃饭、喝水、久坐，判断逻辑是同一套。

**MIT 免费，无需 API Key，不绑账号。** 插件和天气接口不花钱；agent 回答时的模型额度另算（wttr.in 是社区服务可能限流，Open-Meteo 免费额度仅限非商业用途）。

**English**: [README.en.md](README.en.md)

## 快速开始

```bash
# 1. 装
dsh plugin --profile web add github:fanyingnie2163663/dsh-whale-care

# 2. 重启 dsh 后，让 agent 记一下你是谁
「记住：我在合肥，叫我阿宁，我怕冷，平时骑车上班，有鼻炎」

# 3. 之后随时问
「今天要带伞吗」「明天穿什么」「这周哪天最冷」
```

不需要 API Key，不需要注册，偏好只写在本机 `~/.dsh/whale-weather/profile.json`。

**它和普通天气插件的区别**：

| 普通天气插件 | 这个小鲸鱼 |
| --- | --- |
| `降雨概率 78%` | 「今天有雨（78%），出门带把伞」 |
| `明天 12~20°C` | 「明天 12~20°C，白天穿夹克，早晚加件毛衣」 |
| 换个人问，答案一样 | 记得你怕冷、骑车上班、鼻子敏感 |
| 你不问，它不说话 | 每天早上主动说一条（可关、跟着你的作息走） |

## 用在哪：dsh 装了就能用，QQ 可选

**标准 dsh 插件，不依赖 qq-bridge。** 重启 dsh 后，任何会话（Web / TUI / headless）都能用全部 5 个工具；qq-bridge 只是「把 agent 接到 QQ」的可选宿主。

| 场景 | 能用什么 | 提醒/预警会自己响吗 |
| --- | --- | --- |
| 只用 dsh | 全部 5 个工具 | **不会**：只在 agent 醒来时顺带检查 `weather_reminder(due)` / `weather_alert` |
| dsh + qq-bridge | 全部 5 个工具（需加白名单，见下） | **会**：桥接每 30 秒查提醒，07:00 / 18:00 检查预警 |

qq-bridge 额外只提供两件事，都不是插件依赖：

1. **执行期白名单**：`qq-chat-v2` preset 默认拒绝非 MCP 工具，要把 5 个工具名加进 `SAFE_EXACT`；
2. **定时唤醒**：dsh 自身没有定时器，提醒/预警需要宿主到点叫醒 agent。

## 为什么做这个

天气应用会告诉你"降雨概率 78%"，但不会说"你平时老忘带伞，今天记得塞包里"；语音助手会说"明天降温"，但不会记得你怕冷、骑车上班、鼻子敏感。

这个插件想补上后半句：**先算清楚，再用对方听得进去的方式说出来**。

- **知道你是谁**：称呼、怕冷怕热、出行方式、有没有伞、健康备注，都由你设置；
- **知道现在几点**：早上说路上小心，晚上说早点休息，晚上不劝防晒；
- **只说有用的**：按影响排序，最多三条，不把规则表倒给你；
- **只存本地**：偏好在本机 `~/.dsh/whale-weather/profile.json`，不联网上传。

## 五个工具

| 工具 | 用途 |
| --- | --- |
| `weather` | 详细播报：当前天气、空气质量、三天预报、常规建议 |
| `weather_care` | **关心版**：按偏好和时段，写成一句能直接发出去的话 |
| `weather_profile` | 偏好读写：城市、称呼、怕冷怕热、出行方式、伞、健康备注，外加每日关心开关/时间 |
| `weather_reminder` | 到点提醒吃药喝水，或按天气条件提醒（降雨/降温/大风/温差/AQI，命中才说） |
| `weather_alert` | 极端天气预警（暴雨/大风/高温/寒潮/雷电/沙尘/大雾/空气污染），黄橙红三级，当天不重复 |

## 关心版长什么样

设置好偏好后（`weather_profile` 或让 agent 问你几句），`weather_care` 的输出是这样：

> 阿宁，晚上好。合肥现在 14°C（体感 13°C），霾，湿度 69%。
> 明天 9~14°C。白天穿夹克或风衣，早晚棉服，围巾戴上。
> 明天最高只有 14°C，比今天低 6°C，你怕冷，外套和长裤都别省。
> 空气较差（AQI 63），你鼻子敏感，明天口罩戴好。
> 明天霾。
> 早点休息，别熬太晚。

它会根据这些改变措辞和阈值：

| 偏好 | 效果 |
| --- | --- |
| `nickname` | 用对方希望被称呼的名字开头 |
| `coldSensitive` | 降温 3°C 就提醒（默认 5°C），最低温 ≤8°C 就提醒保暖 |
| `heatSensitive` | 28°C 就提醒补水避暑（默认 32°C） |
| `commute` = `bike` | 下雨提醒"路滑慢点"，大风提醒"逆风别硬撑" |
| `commute` = `walk` | 下雨提醒"路上积水绕着走" |
| `hasUmbrella` = false | 下雨时改成"你平时老忘带伞，今天记得塞包里" |
| `notes` 含"鼻/咽/哮喘/过敏" | 空气差时提醒"你鼻子敏感，口罩戴好" |
| 时段 | 早上/中午/下午/晚上不同问候与收尾；晚上会额外预告明天 |

偏好存在 `$DSH_HOME/whale-weather/profile.json`（默认 `~/.dsh/whale-weather/profile.json`，权限 600）。

## 提醒

提醒不是单独的一套东西，本质就是**时间 + 触发条件 + 内容**：

| 类型 | 例子 | 到点行为 |
| --- | --- | --- |
| `intent=text` | 每天 08:00 吃降压药 | 直接说 |
| `intent=weather` | 每天 21:00 检查明天是否降温 ≥5°C | 用**那一刻**的最新预报判断，条件命中才说 |
| `intent=weather` | 每天 07:00 降雨概率 ≥40% 就提醒带伞 | 同上 |
| `intent=weather` | 每天 07:00 温差 ≥10°C 提醒加外套 | 同上 |

- 天气条件在到期那一刻评估，所以昨晚设的提醒不会拿旧预报说错话；
- 同一天不会重复提醒（`lastFiredDate`），有 2 小时补发窗口（08:00 的提醒 09:30 唤醒也还能补）；
- 可以按星期几设置（`days: [1,2,3,4,5]` 只在工作日）；
- 提醒存在 `$DSH_HOME/whale-weather/reminders.json`（600）。

**怎么真的响**：dsh 本身没有定时器，提醒靠宿主在到点时唤醒 agent。配合
`qq-bridge`：它每 30 秒检查 `reminders.json`，到点唤醒对应会话，agent 再调用
`weather_reminder(action=due)` 取出内容并自然说出。纯 dsh Web 环境里，agent 只会在自己醒来时顺带检查。

## 每日关心（可选）

除了你主动问，宿主还可以每天早上替你发一条 `weather_care`。这条有没有、几点发，都由 `weather_profile` 里的两个字段控制：

| 字段 | 说明 |
| --- | --- |
| `dailyCare` | `false` 关掉每天那条，`true`（默认）开着。嫌烦就跟 agent 说「别每天发了」 |
| `careTime` | 固定时刻，24 小时制 `HH:MM`（如 `06:40`）。不设就跟着你的作息自适应 |

**自适应**：宿主会把你每天第一条消息的时间当作起床时间样本。样本 ≥5 天且足够稳定（中位数绝对偏差 ≤45 分钟）时，
关心时间 = 中位时间 +5 分钟；样本不足或作息太乱就回落到宿主默认时段。这样不会在你还睡着的时候弹一条。

> 定时能力在宿主一侧（`qq-bridge` 的 `[care]` 定时器），插件只提供字段和话术；纯 dsh 环境没有这条。

## 可选：接入其他插件的用户印象

插件**不依赖任何宿主**：偏好只来自 `~/.dsh/whale-weather/profile.json`，没有别的文件也完全正常。

如果同机上有别的插件知道这个人的习惯（比如 `qq-bridge` 记录的对群友的印象），它可以定期写一份**只读快照**，本插件会拿它补空缺：

> 这份文件的定义是「**外部插件写的用户印象快照**」，不是本插件自己的数据文件；本插件只读、不写回，也不依赖它。
> 装好插件后让 agent 先 `weather_profile(action="get")` 看一眼——有印象就直接用，没有就正常问。

```json
// $DSH_HOME/whale-weather/user-context.json（建议 600）
{
  "version": 1,
  "updatedAt": 1793399075989,
  "source": "qq-bridge",
  "user": {
    "qq": "741934896",
    "displayName": "DDDeSt1ny",
    "traits": ["平时骑车上班", "有鼻炎"],
    "interactionCount": 3,
    "lastSeenAt": 1793303867850
  }
}
```

- `profile.json` 的值永远优先，快照只补**没填**的字段：出行方式、怕冷怕热、健康备注
- 超过 7 天没更新视为过期；文件不存在 / JSON 坏了 / 版本不对，一律当没有
- 只做关键词匹配（骑车 / 步行 / 公交 / 开车，怕冷 / 怕热，鼻炎 / 过敏 …），
  匹配不上就不猜，也不会把自由文本原样拼进播报
- 写快照是宿主的事，本插件只读、不写回

## 天气源（provider）

天气源是可换的，接口固定：`fetchWeather(city, { days })` 返回统一结构（见 `lib/providers.js` 头部注释）。
上层（关心版/预警/提醒）不关心数据从哪来。

| 源 | 说明 |
| --- | --- |
| `wttr`（默认） | wttr.in，中文映射在插件里做；数据全但依赖单点 |
| `openmeteo` | Open-Meteo（地理编码 + 预报 + 空气质量），全部免费无 Key，wttr 挂了可切 |
| `custom` | 自己写一个模块，导出 `fetchWeather` 即可 |

选择方式（优先级从高到低）：

1. 环境变量 `DSH_WEATHER_PROVIDER=wttr|openmeteo|custom`
2. `$DSH_HOME/whale-weather/config.json`：

```json
{
  "provider": "openmeteo",
  "fallback": ["wttr"],
  "customModule": "/opt/weather/my-provider.mjs"
}
```

3. 默认 `wttr`，失败后自动按 `fallback` 依次重试（默认 wttr → openmeteo）。

**自定义源示例**（任何能拿到温度/降雨/风的地方都可以，比如气象局接口）：

```js
// my-provider.mjs
export async function fetchWeather(city, { days = 3 } = {}) {
  return {
    place: city,
    now: { temp: 20, feels: 19, desc: '晴', humidity: 55, wind: 8, visibility: 10, uv: 4 },
    air: { aqi: 45, pm25: 20 },                        // 可为 null
    days: [{ label: '今天', date: '10-30', min: 12, max: 22, desc: '晴',
             rain: 10, wind: 12, precip: 0,
             hours: { h9: 15, h15: 22, h18: 18, h21: 14 } }],
    fetchedAt: Date.now(),
  };
}
```

设置 `DSH_WEATHER_PROVIDER=custom` + `DSH_WEATHER_PROVIDER_MODULE=/绝对路径/my-provider.mjs` 即可。

## 极端天气预警

不依赖官方预警接口，用预报数据按阈值分级（黄/橙/红），文案会写明"预报推算"：

| 类型 | 阈值（黄/橙/红） |
| --- | --- |
| 暴雨 | 降水 25 / 50 / 100 mm |
| 大风 | 风速 50 / 62 / 75 km/h |
| 高温 | 最高 35 / 37 / 40°C |
| 低温 | 最低 -10 / -20°C（橙/红） |
| 寒潮 | 24h 降温 8 / 12 / 16°C |
| 雷电 / 沙尘 | 天气现象含"雷" / "沙尘"（黄） |
| 大雾 | 能见度 ≤1km（黄）/ ≤0.5km（橙） |
| 空气污染 | AQI 100 / 150 / 200 |

- `weather_alert` 返回当天还没报过的预警并记为已报（`alerts-fired.json`），`peek=true` 只看不记；
- `weather` 详细播报末尾会附预警；`weather_care` 会在开头带上；
- **定时检查**：qq-bridge 每天固定时段（默认 07:00 / 18:00）唤醒一次，由 agent 调 `weather_alert`，
  没有预警就保持安静。桥接侧用环境变量配置：

```
QQ_WEATHER_ALERT_TIMES=07:00,18:00      # 逗号分隔
QQ_WEATHER_ALERT_TARGET=private:741934896
QQ_WEATHER_ALERT_ENABLED=false          # 关闭
```

## 详细播报特性

- **当前天气**：温度、体感、天气现象（中文）、湿度、风速、能见度
- **空气质量**：AQI + PM2.5 + 等级（优/良/中等/较差/很差）
- **未来三天**：高低温、天气、**降雨概率**、风力
- **建议**（命中才输出，最多 4 条）：
  - 降雨概率 ≥40%，或当天天气带「雨」→ 带伞
  - 风力 ≥30km/h → 围巾 + 防风外套
  - 明天最高温比今天低 ≥5°C → 加衣服（高 ≥5°C → 可以少穿）
  - 昼夜温差 ≥10°C → 早晚加外套
  - 最低温 ≤5°C → 保暖
  - 紫外线指数 ≥6 → 防晒
  - AQI ≤20 优 → 适合出去走走；20–40 良 → 可以出门；40–60 中等 → 敏感人群少出门；>60 较差 → 戴口罩减少户外
- **中文天气描述**：wttr 自带的 `lang_zh` 实测不翻译，本插件内置 WWO 天气代码 → 中文映射（40+ 条），匹配不到才回退英文
- 纯逻辑与 dsh 适配分离：`dsh-whale-care/weather`、`dsh-whale-care/care` 可以直接 import 到别的 agent 框架

## 安装说明

安装命令见上面的「快速开始」，装完重启 dsh 生效，agent 的工具列表里会出现 **`weather`**。

**支持的 DSH 版本**：`0.1.2-rc.1` ~ `0.2.x`。`package.json` 按世代声明 peer 区间
（`>=0.1.2-rc.1 <0.2.0 || … || >=0.2.1-0 <0.3.0`），`engines.dsh` 同步声明；
`0.3` 未验证，peer 门禁会拒装而不是装完崩溃。

装好后建议让 agent 先跑一次 `weather_profile(action="get")`：如果本机已有别的插件存过你的偏好/印象
（见「可选：接入其他插件的用户印象」），返回里会出现「印象（来自 xxx）」，直接参考即可，不用重复回答。

## 用法

工具签名：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `city` | string（可选） | 城市名，中文/拼音/英文均可；不传则用 `weather_profile` 里的默认城市 |
| `days` | integer（可选） | 预报天数 1~3，默认 3 |

`weather_profile` 的字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `city` | string | 默认城市 |
| `nickname` | string | 希望被怎么称呼 |
| `coldSensitive` | boolean | 怕冷，降温 3°C 就提醒 |
| `heatSensitive` | boolean | 怕热，28°C 就提醒 |
| `commute` | `walk` / `bike` / `transit` / `drive` / `none` | 出行方式，影响下雨/大风的措辞 |
| `hasUmbrella` | boolean | 是否随身带伞 |
| `notes` | string | 健康备注，如「有鼻炎」「带娃」 |
| `dailyCare` | boolean | 每天早上那条主动关心的开关，`false` 关掉 |
| `careTime` | string | 固定发送时刻 `HH:MM`；不设 = 跟着作息自适应 |

对话里直接说「查一下合肥天气」「明天要带伞吗」「我该穿什么」即可；第一次可以跟 agent 说「记住我怕冷、平时骑车出门」。`weather_care` 会优先用这些偏好。

> 出行方式不限于上班：上学、买菜、遛狗、跑步都算，选最接近的那项就行。

## 示例输出

```
合肥 现在 14°C（体感 13°C），霾，湿度 69%，风 5km/h，能见度 10km
空气质量 较差（AQI 63，PM2.5 57μg/m³）
今天（10-30）12~23°C 晴，降雨概率 6%，风 9km/h
明天（10-31）14~24°C 霾，降雨概率 16%，风 19km/h
后天（11-01）12~20°C 毛毛雨，降雨概率 78%，风 28km/h

建议：
· 降雨概率最高 78%，出门记得带伞
· 今天昼夜温差 11°C，早晚加件外套
· 空气较差（AQI 63），出门戴口罩、减少户外
```

```
三亚 现在 24°C（体感 27°C），局部有雨，湿度 90%，风 10km/h，能见度 10km
空气质量 良（AQI 22，PM2.5 4μg/m³）
…
建议：
· 今天局部有雨，出门记得带伞
· 空气不错（AQI 22），可以出门转转
```

## 可选：接入 QQ 机器人（qq-bridge）

这一步**只有想让 agent 在 QQ 上说话时才需要**；直接用 dsh 的话可以跳过整节。

接入后 qq-bridge 会额外提供定时唤醒（提醒/预警到点自己响），但它的 `qq-chat-v2` preset 有一层执行期工具白名单（`plugins/qq-agent-presets/qq-tool-restrict.mjs` 的 `SAFE_EXACT`），非 MCP 工具默认会被拒绝。要把本插件用在 QQ 里，把这 5 个工具名加进 `SAFE_EXACT`：

```js
const SAFE_EXACT = new Set([
  'ask_user_question',
  'todo_write',
  'weather',            // ← dsh-whale-care
  'weather_care',       // ← dsh-whale-care
  'weather_profile',    // ← dsh-whale-care
  'weather_reminder',   // ← dsh-whale-care
  'weather_alert',      // ← dsh-whale-care
])
```

然后重启 dsh。没加的话，模型会收到 `工具 "weather" 不在 QQ 桥接白名单内` 的报错。

## 数据源与隐私

| 用途 | 服务 | 发送的数据 |
| --- | --- | --- |
| 天气 | [wttr.in](https://wttr.in) | 城市名 |
| 空气质量 | [open-meteo.com](https://open-meteo.com) | wttr 返回的经纬度 |

不发送任何账号、密钥、聊天内容；插件不收集、不上报任何使用数据。两个服务都是免注册的公共接口（wttr.in 是社区服务，可能限流；Open-Meteo 的免费额度仅限非商业用途），请勿高频滥用。

## 开发

```bash
# 不依赖 dsh，直接跑真实请求
node scripts/demo.mjs 合肥                # 详细播报
node scripts/demo.mjs 合肥 care           # 关心版（默认偏好）
node scripts/demo.mjs 合肥 care '{"nickname":"阿宁","coldSensitive":true,"commute":"bike"}'

# 离线单测（不需要网络和 API key）
for f in scripts/test-*.mjs; do node "$f"; done   # 7 个文件 / 111 条断言

# 清单自检：包名 / 插件 id / exports / 版本 / 安装命令是否一致
# （本地开发工具，不在仓库里；见 AGENTS.md）
```

目录：

```
lib/weather.js       纯逻辑：wttr 解析 + 中文映射 + 详细建议
lib/openmeteo.js     纯逻辑：Open-Meteo 数据源（地理编码 + 预报 + 空气质量）
lib/providers.js     天气源抽象：选择 / 降级 / 自定义模块
lib/care.js          纯逻辑：偏好 + 时段 + 分时段温度 → 关心版话术
lib/profile.js       偏好读写（$DSH_HOME/whale-weather/profile.json）
lib/user-context.js  可选：读取其他插件写的用户印象快照（只读、7 天过期）
lib/reminders.js     统一提醒：时间窗、去重、天气条件评估
lib/alerts.js        极端天气预警：阈值分级 + 当天去重
lib/index.js         dsh 适配：defineTool 注册五个工具
cordis.patch.yml     dsh bundle patch
scripts/demo.mjs     独立演示脚本
scripts/test-*.mjs   离线单测（7 个文件 / 111 条断言）
```

## Roadmap

- [x] 当前天气 / 三天预报 / 空气质量
- [x] 带伞、加衣、防风、温差、紫外线、AQI 建议
- [x] 关心版话术 + 本地偏好档案（称呼、怕冷怕热、出行方式、伞、健康备注）
- [x] 出行方式中性化（不止「上班」）
- [x] 统一提醒引擎：吃药/喝水等定时提醒 + 带天气条件的提醒（降雨/降温/大风/温差/AQI）
- [x] 分时段温度（早上/下午/晚上各多少，一天差多少）
- [x] QQ 桥接定时唤醒（每 30 秒检查到点提醒）
- [x] 极端天气预警：暴雨、大风、高温、寒潮、雷电、沙尘、大雾、空气污染
- [x] 可切换天气源（wttr / openmeteo / 自定义），失败自动降级
- [x] 穿衣建议（按温度带分白天/早晚；怕冷怕热各调 2°C）
- [x] 每日主动关心（可开关、跟随作息；宿主直发时不经过模型）
- [x] 可选的用户印象接入：其他插件写 `user-context.json`，偏好档案优先
- [x] 上架 awesome-dsh-plugin 插件市场
- [ ] 逐小时预报：今天到底几点会下雨
- [ ] 多城市 / 临时切换（出差、旅行）
- [ ] 更多关心维度：作息、带娃、养宠物
- [ ] 英文输出（i18n）

## 许可

MIT。天气数据版权归 wttr.in / open-meteo 各自所有。
