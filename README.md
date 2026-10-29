# dsh-whale-weather · 小鲸鱼天气

> 当前版本 **0.1.0**（早期版本，功能还在加）。

给 [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) 的**关心型**天气插件：不只是报天气，而是结合对方是谁、此刻几点，把"今天该注意什么"说成一句人话。

免费、无需 API Key、不做任何账号绑定。

**English**: [README.en.md](README.en.md)

## 三个工具

| 工具 | 用途 |
| --- | --- |
| `weather` | 详细播报：当前天气、空气质量、未来三天、常规建议 |
| `weather_care` | **关心版**：结合用户偏好与时段，写成一段可以直接发出去的话 |
| `weather_profile` | 读写用户偏好：城市、称呼、怕冷/怕热、通勤方式、有没有带伞、健康备注 |

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
| `commute` | `walk` / `bike` / `transit` / `drive` / `none` | 通勤方式，影响下雨/大风的措辞 |
| `hasUmbrella` | boolean | 是否随身带伞 |
| `notes` | string | 健康备注，如「有鼻炎」「带娃」 |

对话里直接说「查一下合肥天气」「明天要带伞吗」「我该穿什么」即可；第一次可以跟 agent 说「记住我怕冷、平时骑车上班」。`weather_care` 会优先用这些偏好。

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

## 给 QQ 机器人用户（qq-bridge）

`qq-bridge` 的 `qq-chat-v2` preset 有一层执行期工具白名单（`plugins/qq-agent-presets/qq-tool-restrict.mjs` 的 `SAFE_EXACT`），非 MCP 工具默认会被拒绝。要把本插件用在 QQ 群里，在 `SAFE_EXACT` 里加一行：

```js
const SAFE_EXACT = new Set([
  'ask_user_question',
  'todo_write',
  'weather',            // ← dsh-whale-weather
  'weather_care',       // ← dsh-whale-weather
  'weather_profile',    // ← dsh-whale-weather
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
```

目录：

```
lib/weather.js   纯逻辑：wttr + open-meteo + 中文映射 + 详细建议
lib/care.js      纯逻辑：偏好 + 时段 → 关心版话术
lib/profile.js   偏好读写（$DSH_HOME/whale-weather/profile.json）
lib/index.js     dsh 适配：defineTool 注册三个工具
cordis.patch.yml dsh bundle patch
scripts/demo.mjs 独立演示脚本
```

## 许可

MIT。天气数据版权归 wttr.in / open-meteo 各自所有。
