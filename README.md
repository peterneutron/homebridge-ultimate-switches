# homebridge-ultimate-switches

`homebridge-ultimate-switches` consolidates command switches, virtual switches, timers, locks, security primitives, calendar triggers, and a context sensor into one maintained Homebridge plugin for both 1.x and 2.x.

- Platform: `UltimateSwitches`
- Homebridge: `^1.6.0 || ^2.0.0-beta.0`
- Node.js: `^18.20.4 || ^20.15.1 || ^22`
- Config UI: Custom Config UI X page (`customUi: true`)

## Features

- Command Switches (`on`, optional `off`, optional `state` poll, optional auto-off)
- Basic virtual switches
- Timer / momentary switches
- Virtual locks
- Virtual security systems with zones
- Calendar triggers split into root, watched-event, and notification accessories
- Context sensor (month, ISO week, season, time-of-day families)
- Global calendar deadline queue for high-resolution notification boundaries between fetch intervals

## Install

```bash
npm i -g homebridge-ultimate-switches
```

Configure the plugin in Homebridge Config UI X using platform name `UltimateSwitches`.

## Quick Start (Minimal Valid Platform Block)

```json
{
  "platform": "UltimateSwitches",
  "name": "Ultimate Switches",
  "debug": false,
  "commandSwitches": [],
  "switches": [],
  "timers": [],
  "locks": [],
  "securitySystems": [],
  "calendarTriggers": [],
  "contextSensor": {
    "enabled": false,
    "name": "Home Context"
  }
}
```

## Complete Example (All Groups)

Legend:
- `Required`: field must be provided for that row type.
- `Optional`: field may be omitted.

```json
{
  "platform": "UltimateSwitches",
  "name": "Ultimate Switches",
  "debug": false,
  "commandSwitches": [
    {
      "name": "Command Switch",
      "on": "192.168.1.50/api/on",
      "off": {
        "input": "http://192.168.1.50/api/off",
        "method": "POST",
        "headers": { "X-Token": "secret" },
        "body": "{\"power\":\"off\"}"
      },
      "status": {
        "input": "devicectl status",
        "matchPattern": "power:\\s*on",
        "matchFlags": "i"
      },
      "polling": true,
      "pollIntervalSeconds": 5,
      "commandTimeoutSeconds": 5
    }
  ],
  "switches": [
    {
      "name": "Switch",
      "defaultOn": true,
      "persistState": true
    }
  ],
  "timers": [
    {
      "name": "Timer",
      "periodSeconds": 60,
      "autoOff": true,
      "emitMotionPulse": true,
      "persistState": false
    }
  ],
  "locks": [
    {
      "name": "Virtual Front Door",
      "defaultState": "unlocked",
      "persistState": true
    }
  ],
  "securitySystems": [
    {
      "name": "Virtual Alarm",
      "defaultState": "unarmed",
      "zones": [
        "Alarm",
        "Perimeter"
      ],
      "armAwayButtonLabel": "Arm Away",
      "armStayButtonLabel": "Arm Stay",
      "armNightButtonLabel": "Arm Night",
      "persistState": true
    }
  ],
  "calendarTriggers": [
    {
      "name": "Calendar",
      "url": "webcal://example.com/calendar.ics",
      "updateIntervalMinutes": 30,
      "requestTimeoutSeconds": 15,
      "updateButton": true,
      "triggerOnUpdates": true,
      "triggerOnAnyEvent": false,
      "events": [
        {
          "name": "^(Event1|Event2|Event3)$",
          "triggerOnUpdates": true,
          "notifications": [
            {
              "name": "Start",
              "startOffsetMinutes": 0
            },
            {
              "name": "Prep Reminder",
              "startOffsetMinutes": -30
            },
            {
              "name": "Finished Soon",
              "endOffsetMinutes": -60
            }
          ]
        }
      ]
    }
  ],
  "contextSensor": {
    "enabled": true,
    "name": "Home Context",
    "latitude": 37.773972,
    "longitude": -122.431297,
    "refreshIntervalSeconds": 60
  }
}
```

## Config Reference

### `commandSwitches[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `commandSwitches`. |
| `on` | Required (preferred) | - | Action spec or string shorthand for ON. Auto-detects command vs webhook. |
| `off` | Optional (preferred) | `undefined` | Action spec or string shorthand for OFF. If omitted, OFF flips state without transport call. |
| `status` | Optional (preferred) | `undefined` | Action spec/string shorthand for polling state. Required when `polling=true` (or use legacy `stateCommand`). |
| `onCommand` | Legacy | - | Legacy command-only ON field. Cannot be combined with `on`. |
| `offCommand` | Legacy | `undefined` | Legacy command-only OFF field. Cannot be combined with `off`. |
| `stateCommand` | Legacy | `undefined` | Legacy command-only status field. Cannot be combined with `status`. |
| `polling` | Optional | `false` | Enables periodic state command polling. |
| `pollIntervalSeconds` | Optional | `5` | Clamped to `1..300`. |
| `commandTimeoutSeconds` | Optional | `5` | Unified timeout for command and webhook actions, `1..120`. |
| `autoOffSeconds` | Optional | `undefined` | Auto-off delay after successful ON, `1..86400`. |

`commandSwitches[].on|off|status` object fields:

| Field | Required | Default | Notes |
|---|---|---|---|
| `input` | Required (object form) | - | Command string or webhook URL/IP shorthand. |
| `type` | Optional | `auto` | `auto`, `command`, or `webhook`. |
| `method` | Optional | `GET` | Webhook only; `GET` or `POST`. |
| `headers` | Optional | `undefined` | Webhook only; string header map. |
| `body` | Optional | `undefined` | Webhook only; request body (string). |
| `matchPattern` | Optional | `undefined` | Regex matched against command `stdout` or webhook response body. |
| `matchFlags` | Optional | `undefined` | JS regex flags (requires `matchPattern`). |
| `matchInvert` | Optional | `false` | Inverts regex match result. |

Command switch action notes:

- String shorthand auto-detects webhooks for `http://`, `https://`, IPv4/IPv6 shorthand, and `localhost` targets. IP/localhost shorthand is normalized to `http://`.
- Status actions default to `true` on successful command exit / HTTP `2xx`, and `false` on failures. `matchPattern` (if set) overrides this by parsing output/body.
- `matchPattern` on `on`/`off` is optional and can be used as confirmation after a successful command/webhook call.

Example: mixed webhook + CLI status

```json
{
  "name": "Projector",
  "on": "192.168.1.50/api/on",
  "off": {
    "input": "192.168.1.50/api/off",
    "method": "POST"
  },
  "status": {
    "input": "projectorctl status",
    "matchPattern": "power:\\s*on",
    "matchFlags": "i"
  },
  "polling": true,
  "pollIntervalSeconds": 5
}
```

Legacy migration (still supported):

```json
{
  "name": "Legacy Switch",
  "onCommand": "device on",
  "offCommand": "device off",
  "stateCommand": "device status",
  "polling": true
}
```

Equivalent preferred form:

```json
{
  "name": "Legacy Switch",
  "on": "device on",
  "off": "device off",
  "status": "device status",
  "polling": true
}
```

### `switches[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `switches`. |
| `defaultOn` | Optional | `false` | Initial state when not persisted. |
| `persistState` | Optional | `false` | Persists state in accessory context cache. |

### `timers[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `timers`. |
| `periodSeconds` | Optional | `60` | Clamped to `1..86400`. |
| `autoOff` | Optional | `true` | Auto-reset switch state after pulse cycle. |
| `emitMotionPulse` | Optional | `true` | Emits motion pulse for compatible automations. |
| `persistState` | Optional | `false` | Persists state in accessory context cache. |

### `locks[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `locks`. |
| `defaultState` | Optional | `unlocked` | `locked` or `unlocked`. |
| `persistState` | Optional | `false` | Persists lock state in accessory context cache. |

### `securitySystems[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `securitySystems`. |
| `defaultState` | Optional | `unarmed` | `unarmed`, `armed-stay`, `armed-away`, `armed-night`. |
| `zones` | Optional | `["Alarm"]` | Empty or invalid entries are normalized away. |
| `armAwayButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `armStayButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `armNightButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `persistState` | Optional | `true` | Persists security state in accessory context cache. |

### `calendarTriggers[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `calendarTriggers`. |
| `url` | Required | - | `webcal://` is accepted and normalized to `https://`. |
| `updateIntervalMinutes` | Optional | `30` | Source-of-truth iCal refresh cadence, `1..1440`. |
| `requestTimeoutSeconds` | Optional | `15` | Fetch timeout, `1..120`. |
| `updateButton` | Optional | `true` | Adds manual update switch for that calendar. |
| `triggerOnUpdates` | Optional | `true` | Pulse semantics for active-state updates. |
| `triggerOnAnyEvent` | Optional | `false` | If `false`, requires `events.length >= 1`. |
| `events[]` | Conditional | `[]` | Required when `triggerOnAnyEvent=false`. |

`calendarTriggers[].events[]`:

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Regex string used to match event summaries. |
| `triggerOnUpdates` | Optional | `true` | Pulse semantics for watched event accessory. |
| `notifications[]` | Optional | `[]` | Notification boundaries for matched events. |

`calendarTriggers[].events[].notifications[]`:

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Display label used in accessory naming. |
| `startOffsetMinutes` | Optional | `undefined` | Notification boundary relative to event start. |
| `endOffsetMinutes` | Optional | `undefined` | Notification boundary relative to event end. |

At least one of `startOffsetMinutes` or `endOffsetMinutes` is required per notification row.

### `contextSensor`

| Field | Required | Default | Notes |
|---|---|---|---|
| `enabled` | Optional | `false` | Enables/disables context sensor accessory. |
| `name` | Optional | `Home Context` | Accessory display name. |
| `latitude` | Conditional | `undefined` | Required when `enabled=true`, range `-90..90`. |
| `longitude` | Optional | `undefined` | Accepted but currently informational. |
| `refreshIntervalSeconds` | Optional | `60` | Clamped to `30..3600`. |

## Calendar Semantics

- Calendar exposure model:
  - 1 root accessory per calendar trigger
  - 1 accessory per watched event definition
  - 1 accessory per notification definition
- Contact semantics:
  - active state = Contact Open (`CONTACT_NOT_DETECTED`)
  - inactive state = Contact Closed (`CONTACT_DETECTED`)
- Scheduler model:
  - iCal refresh (`updateIntervalMinutes`) keeps source data current
  - global deadline queue handles near-boundary notification triggering between refreshes
  - missed boundaries are only caught up if lateness is `<= 10 minutes`
  - processed event window is bounded to `24h` past and `48h` future

## Logging Contract

- INFO logs:
  - effective accessory state transitions
  - command switch auto-off schedule/cancel/execute
  - calendar event deltas (`+/-/~`) and fired notification counts
- DEBUG logs (`debug: true`):
  - queue timing details and dedupe decisions
  - command execution timing and polling internals
  - calendar refresh windows and matching detail

## If You Currently Use Multiple Switch/Calendar Plugins

Typical consolidation mapping:
- command-switch style plugins -> `commandSwitches`
- automation/momentary switch plugins -> `timers`
- calendar scheduler style plugins -> `calendarTriggers`
- calendar context accessory plugins -> `contextSensor`

## Development

```bash
npm install
npm test
```

Tests use the built-in Node.js test runner (`node --test`).
