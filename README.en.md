# dsh-whale-weather

Weather plugin for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness): current conditions, 3-day forecast, air quality, and **actionable advice** (umbrella, clothing, wind, whether to go out).

Free, no API key, no account binding.

**中文**: [README.md](README.md)

## Features

- **Current**: temperature, feels-like, condition (localized to Chinese), humidity, wind, visibility
- **Air quality**: AQI + PM2.5 + level (excellent / good / moderate / poor / very poor)
- **3-day forecast**: high/low, condition, **chance of rain**, wind
- **Advice** (only when relevant, max 4 lines):
  - rain probability ≥40% (or today's condition has rain) → take an umbrella
  - wind ≥30 km/h → scarf + windproof jacket
  - tomorrow's high ≥5°C lower than today → dress warmer (≥5°C higher → lighter clothes)
  - day/night swing ≥10°C → jacket for morning/evening
  - low ≤5°C → keep warm
  - UV index ≥6 → sun protection
  - AQI ≤20 → great for a walk; 20–40 → fine to go out; 40–60 → sensitive groups stay in; >60 → mask, less outdoor time
- **Chinese condition mapping**: wttr's `lang_zh` does not actually translate; this plugin ships a 40+ entry WWO → Chinese map, falling back to the original text
- Core logic is decoupled from dsh: import `dsh-whale-weather/weather` from any agent framework

## Install

```bash
dsh plugin --profile web add dsh-whale-weather
```

or straight from GitHub:

```bash
dsh plugin --profile web add github:fanyingnie2163663/dsh-whale-weather
```

Restart dsh (`dsh web`) afterwards. The agent's tool list will then contain **`weather`**.

## Usage

| Param | Type | Description |
| --- | --- | --- |
| `city` | string (required) | City name in Chinese, pinyin or English (Hefei, 合肥, Tokyo) |
| `days` | integer (optional) | Forecast days 1–3, default 3 |

## Sample output

```
Hefei now 14°C (feels like 13°C), haze, humidity 69%, wind 5km/h, visibility 10km
Air quality poor (AQI 63, PM2.5 57μg/m³)
Today (10-30) 12~23°C sunny, rain 6%, wind 9km/h
Tomorrow (10-31) 14~24°C haze, rain 16%, wind 19km/h
Day after (11-01) 12~20°C drizzle, rain 78%, wind 28km/h

Advice:
· Rain chance up to 78% — take an umbrella
· Today's day/night swing is 11°C — bring a jacket
· Air is poor (AQI 63) — wear a mask, less time outdoors
```

(The actual output is Chinese; see README.md.)

## QQ bot users (qq-bridge)

`qq-bridge`'s `qq-chat-v2` preset enforces an execution-time tool allowlist (`SAFE_EXACT` in `plugins/qq-agent-presets/qq-tool-restrict.mjs`). Non-MCP tools are rejected by default. Add one line:

```js
const SAFE_EXACT = new Set([
  'ask_user_question',
  'todo_write',
  'weather',            // ← dsh-whale-weather
])
```

Then restart dsh; otherwise the model gets `工具 "weather" 不在 QQ 桥接白名单内`.

## Data sources & privacy

| Purpose | Service | Data sent |
| --- | --- | --- |
| Weather | [wttr.in](https://wttr.in) | city name |
| Air quality | [open-meteo.com](https://open-meteo.com) | lat/lon returned by wttr |

No accounts, keys or chat content are sent. The plugin collects and reports nothing. Both services are free public endpoints — please don't hammer them.

## Development

```bash
node scripts/demo.mjs Hefei
node scripts/demo.mjs Tokyo 2
```

```
lib/weather.js   pure logic: wttr + open-meteo + Chinese map + advice rules
lib/index.js     dsh adapter: registers the `weather` tool via defineTool
cordis.patch.yml dsh bundle patch
scripts/demo.mjs standalone demo
```

## License

MIT. Weather data remains the property of wttr.in / open-meteo.
