# dsh-whale-weather · 小鲸鱼天气

![version](https://img.shields.io/badge/version-0.3.2-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5--rc.1-6f42c1)
![no api key](https://img.shields.io/badge/API%20key-not%20required-brightgreen)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)

> 当前版本 **0.3.2**（早期版本，功能还在加）。

给 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的**关心型**天气插件：不只是报天气，而是结合对方是谁、此刻几点，把"今天该注意什么"说成一句人话。

免费、无需 API Key、不做任何账号绑定。

**English**: [README.en.md](README.en.md)

## 用在哪：直接装在 DSH 就能用，QQ 是可选的

**本插件是标准 dsh 插件，不依赖 qq-bridge。**

```bash
dsh plugin --profile web add dsh-whale-weather
```

重启 dsh 后，**任何 dsh 会话**（Web、TUI、headless）都能调用全部 5 个工具。qq-bridge 只是「把 agent 接到 QQ」的可选宿主，不是运行前提。

| 场景 | 能用什么 | 提醒/预警会自己响吗 |
| --- | --- | --- |
| 只用 dsh（Web / TUI / headless） | 全部 5 个工具 | **不会**：只在你和 agent 对话、它醒来时顺带调用 `weather_reminder(due)` / `weather_alert` 检查 |
| dsh + qq-bridge（QQ 群/私聊） | 全部 5 个工具（需加白名单，见下） | **会**：桥接每 30 秒查一次提醒，并在 07:00 / 18:00 自动检查预警 |

qq-bridge 额外做的只有两件事，都不是插件本身的依赖：

1. **执行期工具白名单**：`qq-chat-v2` preset 默认拒绝非 MCP 工具，需要把 5 个工具名加进 `SAFE_EXACT`（见「给 QQ 机器人用户」）；
2. **定时唤醒**：dsh 自身没有定时器，提醒/预警需要一个宿主在到点唤醒 agent；qq-bridge 用 `reminders.json` 和固定时段做这件事。没有它，提醒只会在 agent 下次醒来时才被检查。

## 为什么做这个

天气应用会告诉你"降雨概率 78%"，但不会说"你平时老忘带伞，今天记得塞包里"；
语音助手会说"明天降温"，但不会记得你怕冷、骑车上班、鼻子敏感。

这个插件想补上后半句：**先算清楚，再用对方听得进去的方式说出来**。

- **它知道你是谁**：称呼、怕冷/怕热、出行方式、有没有伞、健康备注，都来自用户主动设置；
- **它知道现在几点**：早上说"路上小心"，晚上说"早点休息"，不会晚上提醒你防晒；
- **它只说有用的**：按影响大小排序，最多三条，不把规则表倒给用户；
- **它是本地的**：偏好存在本机 `~/.dsh/whale-weather/profile.json`，不联网上传。

## 五个工具

| 工具 | 用途 |
| --- | --- |
| `weather` | 详细播报：当前天气、空气质量、未来三天、常规建议 |
| `weather_care` | **关心版**：结合用户偏好与时段，写成一段可以直接发出去的话 |
| `weather_profile` | 读写用户偏好：城市、称呼、怕冷/怕热、出行方式、有没有带伞、健康备注 |
| `weather_reminder` | 统一提醒：到点提醒吃药/喝水，或带天气条件的提醒（降雨/降温/大风/温差/空气质量，命中才提醒） |
| `weather_alert` | 极端天气预警：暴雨/大风/高温/低温寒潮/雷电/沙尘/大雾/空气污染，黄橙红三级，当天不重复报 |

## 关心版长什么样

设置好偏好后（`weather_profile` 或让 agent 问你几句），`weather_care` 的输出是这样：

> 阿宁，晚上好。合肥现在 14°C，霾，空气较差。
> 明天最高只有 14°C，比今天低 6°C，你怕冷，外套和长裤都别省。
> 空气较差（AQI 63），你鼻子敏感，口罩戴好。
> 明天霾，9~14°C，降雨概率 13%，伞先放门口。
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
| 信息缺失 | 下雨但不知道有没有伞时，会问一句"伞在包里吗？" |

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
- 纯逻辑与 dsh 适配分离：`dsh-whale-weather/weather`、`dsh-whale-weather/care` 可以直接 import 到别的 agent 框架

## 安装

```bash
dsh plugin --profile web add dsh-whale-weather
```

或直接从 GitHub 装：

```bash
dsh plugin --profile web add github:fanyingnie2163663/dsh-whale-weather
```

装完重启 dsh（`dsh web`）生效。之后 agent 的工具列表里会出现 **`weather`**。

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
  'weather',            // ← dsh-whale-weather
  'weather_care',       // ← dsh-whale-weather
  'weather_profile',    // ← dsh-whale-weather
  'weather_reminder',   // ← dsh-whale-weather
  'weather_alert',      // ← dsh-whale-weather
])
```

然后重启 dsh。没加的话，模型会收到 `工具 "weather" 不在 QQ 桥接白名单内` 的报错。

## 数据源与隐私

| 用途 | 服务 | 发送的数据 |
| --- | --- | --- |
| 天气 | [wttr.in](https://wttr.in) | 城市名 |
| 空气质量 | [open-meteo.com](https://open-meteo.com) | wttr 返回的经纬度 |

不发送任何账号、密钥、聊天内容；插件不收集、不上报任何使用数据。两个服务都是免费的公共接口，请勿高频滥用。

## 开发

```bash
# 不依赖 dsh，直接跑真实请求
node scripts/demo.mjs 合肥                # 详细播报
node scripts/demo.mjs 合肥 care           # 关心版（默认偏好）
node scripts/demo.mjs 合肥 care '{"nickname":"阿宁","coldSensitive":true,"commute":"bike"}'
node scripts/test-reminders.mjs           # 离线单测：时间窗/去重/五种天气条件
node scripts/test-alerts.mjs              # 离线单测：预警阈值分级 + 平静天气不误报
```

目录：

```
lib/weather.js   纯逻辑：wttr 解析 + 中文映射 + 详细建议
lib/openmeteo.js 纯逻辑：Open-Meteo 数据源（地理编码 + 预报 + 空气质量）
lib/providers.js 天气源抽象：选择 / 降级 / 自定义模块
lib/care.js      纯逻辑：偏好 + 时段 + 分时段温度 → 关心版话术
lib/profile.js   偏好读写（$DSH_HOME/whale-weather/profile.json）
lib/reminders.js 统一提醒：时间窗、去重、天气条件评估
lib/alerts.js    极端天气预警：阈值分级 + 当天去重
lib/index.js     dsh 适配：defineTool 注册五个工具
cordis.patch.yml dsh bundle patch
scripts/demo.mjs 独立演示脚本
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
- [ ] 逐小时预报：今天到底几点会下雨
- [ ] 多城市 / 临时切换（出差、旅行）
- [ ] 更多关心维度：作息、带娃、养宠物
- [ ] 主动早晚问候（需要宿主提供定时能力）
- [ ] 英文输出（i18n）

## 许可

MIT。天气数据版权归 wttr.in / open-meteo 各自所有。
