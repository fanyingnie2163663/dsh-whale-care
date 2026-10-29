# dsh-whale-weather

![version](https://img.shields.io/badge/version-0.3.3-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5--rc.1-6f42c1)
![no api key](https://img.shields.io/badge/API%20key-not%20required-brightgreen)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933)

> Current version **0.3.3** (early, still growing).

A **caring** weather plugin for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness): it does not just report the forecast — it turns it into a short, human message tailored to who the user is and what time it is.

Free, no API key, no account binding.

**中文**: [README.md](README.md)

## Where it runs: plain dsh, QQ is optional

**This is a standard dsh plugin and does not depend on qq-bridge.**

```bash
dsh plugin --profile web add github:fanyingnie2163663/dsh-whale-weather
```

Restart dsh and **any dsh session** (Web, TUI, headless) can call all five tools. qq-bridge is only an optional host that puts the agent on QQ.

| Setup | What you get | Do reminders/alerts fire on time? |
| --- | --- | --- |
| dsh only (Web / TUI / headless) | all five tools | **No**: they are checked when you talk to the agent and it calls `weather_reminder(due)` / `weather_alert` |
| dsh + qq-bridge (QQ) | all five tools (allowlist needed) | **Yes**: the bridge checks reminders every 30s and alerts at 07:00 / 18:00 |

qq-bridge adds exactly two things, neither of which the plugin depends on:

1. **Runtime tool allowlist**: the `qq-chat-v2` preset rejects non-MCP tools by default, so the five names must be added to `SAFE_EXACT` (see “QQ bot users”);
2. **Scheduled wake-ups**: dsh has no timer of its own; a reminder/alert needs a host to wake the agent at the right moment. Without it, reminders are only checked the next time the agent is awake.

## Why

A weather app says "78% chance of rain"; it does not say "you always forget your umbrella — put one in your bag".
A voice assistant says "it will be colder tomorrow"; it does not remember that you feel the cold, bike everywhere, or have a sensitive nose.

This plugin tries to say the second half: **do the math, then say it in a way the person will actually take in.**

- **It knows who you are**: nickname, cold/heat sensitivity, how you get around, umbrella, health notes — all explicitly set by the user;
- **It knows what time it is**: "take care on the way" in the morning, "get some rest" at night; no sunscreen reminders after dark;
- **It only says what matters**: ranked by impact, at most three items, never a rules dump;
- **It stays local**: preferences live in `~/.dsh/whale-weather/profile.json`, nothing is uploaded.

## Five tools

| Tool | Purpose |
| --- | --- |
| `weather` | Detailed report: current conditions, air quality, 3-day forecast, generic advice |
| `weather_care` | **Caring version**: personalized by profile and time of day, ready to send as-is |
| `weather_profile` | Read/write preferences: city, nickname, cold/heat sensitivity, how you get around, umbrella, health notes |
| `weather_reminder` | One reminder engine: timed text reminders (medication, water) or weather-conditioned ones (rain/temp drop/wind/swing/AQI; speaks only when the condition matches) |
| `weather_alert` | Extreme-weather alerts: rainstorm / gale / heat / cold wave / thunder / dust / fog / air pollution, levels yellow/orange/red, deduped per day |

## What the caring version looks like

> A-Ning, good evening. Hefei is 14°C now, haze, air is poor.
> Tomorrow's high is only 14°C, 6°C lower than today — you feel the cold, so take a proper jacket.
> Air is poor (AQI 63) — your nose is sensitive, keep the mask on.
> Tomorrow haze, 9–14°C, rain 13%, leave the umbrella by the door.
> Get some rest, don't stay up too late.

How preferences change the wording and thresholds:

| Preference | Effect |
| --- | --- |
| `nickname` | Opens with the name the user wants to be called |
| `coldSensitive` | Warns at a 3°C drop (5°C default), keeps-warm at ≤8°C |
| `heatSensitive` | Heat warning at 28°C (32°C default) |
| `commute` = `bike` | Rain → "roads are slippery, slow down"; wind → "don't fight the headwind" |
| `commute` = `walk` | Rain → "avoid the puddles" |
| `hasUmbrella` = false | Rain → "you always forget your umbrella, put one in your bag" |
| `notes` with 鼻/咽/哮喘/过敏 | Poor air → "your nose is sensitive, wear the mask" |
| Time of day | Different greeting and closing; evening adds tomorrow's preview |
| Missing info | Rain but umbrella unknown → asks "is your umbrella in the bag?" |

Preferences live in `$DSH_HOME/whale-weather/profile.json` (default `~/.dsh/whale-weather/profile.json`, mode 600).

## Detailed report features

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
dsh plugin --profile web add github:fanyingnie2163663/dsh-whale-weather
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

## Optional: QQ bot users (qq-bridge)

`qq-bridge`'s `qq-chat-v2` preset enforces an execution-time tool allowlist (`SAFE_EXACT` in `plugins/qq-agent-presets/qq-tool-restrict.mjs`). Non-MCP tools are rejected by default. Add one line:

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
