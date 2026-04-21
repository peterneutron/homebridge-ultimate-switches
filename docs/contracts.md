# Contracts

This document holds the durable config and behavior contract for `homebridge-ultimate-switches`.

## Runtime

- Homebridge: `^1.6.0 || ^2.0.0-beta.0`
- Node.js: `^18.20.4 || ^20.15.1 || ^22`
- Platform identifier: `UltimateSwitches`

## Top-Level Config Shape

```json
{
  "platform": "UltimateSwitches",
  "name": "Ultimate Switches",
  "debug": false,
  "commandSwitches": [],
  "switches": [],
  "timers": [],
  "heartbeats": [],
  "locks": [],
  "securitySystems": [],
  "calendarTriggers": [],
  "contextSensor": {
    "enabled": false,
    "name": "Home Context"
  }
}
```

## `commandSwitches[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `commandSwitches`. |
| `on` | Required (preferred) | - | Action spec or string shorthand for ON. Auto-detects command vs webhook. |
| `off` | Optional (preferred) | `undefined` | Action spec or string shorthand for OFF. If omitted, OFF flips state without transport call. |
| `status` | Optional (preferred) | `undefined` | Action spec/string shorthand for polling state. Required when `polling=true` unless legacy `stateCommand` is used. |
| `onCommand` | Legacy | - | Legacy command-only ON field. Cannot be combined with `on`. |
| `offCommand` | Legacy | `undefined` | Legacy command-only OFF field. Cannot be combined with `off`. |
| `stateCommand` | Legacy | `undefined` | Legacy command-only status field. Cannot be combined with `status`. |
| `polling` | Optional | `false` | Enables periodic state polling. |
| `pollIntervalSeconds` | Optional | `5` | Clamped to `1..300`. |
| `commandTimeoutSeconds` | Optional | `5` | Unified timeout for command and webhook actions, `1..120`. |
| `autoOffSeconds` | Optional | `undefined` | Auto-off delay after successful ON, `1..86400`. |

### Command Action Object Form

Fields for `commandSwitches[].on|off|status` when using object form:

| Field | Required | Default | Notes |
|---|---|---|---|
| `input` | Required | - | Command string or webhook URL/IP shorthand. |
| `type` | Optional | `auto` | `auto`, `command`, or `webhook`. |
| `method` | Optional | `GET` | Webhook only; `GET` or `POST`. |
| `headers` | Optional | `undefined` | Webhook only; string header map. |
| `body` | Optional | `undefined` | Webhook only; request body. |
| `matchPattern` | Optional | `undefined` | Regex matched against command `stdout` or webhook response body. |
| `match` | Optional (preferred) | `undefined` | Explicit regex/literal matcher object. Do not combine with `matchPattern`/`matchFlags`/`matchInvert`. |
| `matchFlags` | Optional | `undefined` | JavaScript regex flags. |
| `matchInvert` | Optional | `false` | Inverts regex result. |

Matcher object fields:

| Field | Required | Default | Notes |
|---|---|---|---|
| `pattern` | Required | - | Regex or literal text depending on `mode`. |
| `mode` | Optional | `regex` | `regex` or `literal`. |
| `flags` | Optional | `""` | JavaScript regex flags. |
| `invert` | Optional | `false` | Inverts the match result. |
| `onInvalid` | Optional | `error` | Command switch action matchers use `error`. |

### Command Action Notes

- String shorthand auto-detects webhooks for `http://`, `https://`, IPv4/IPv6 shorthand, and `localhost` targets.
- IP and `localhost` shorthand are normalized to `http://`.
- Status actions default to `true` on successful command exit or HTTP `2xx`, and `false` on failure.
- `matchPattern` or `match` overrides the simple success/failure default by parsing output/body.
- `matchPattern` on `on` and `off` may be used as confirmation after a successful command or webhook call.

Example:

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

Legacy migration:

```json
{
  "name": "Legacy Switch",
  "onCommand": "device on",
  "offCommand": "device off",
  "stateCommand": "device status",
  "polling": true
}
```

Preferred equivalent:

```json
{
  "name": "Legacy Switch",
  "on": "device on",
  "off": "device off",
  "status": "device status",
  "polling": true
}
```

## `switches[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `switches`. |
| `defaultOn` | Optional | `false` | Initial state when not persisted. |
| `persistState` | Optional | `false` | Persists state in accessory context cache. |

## `timers[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `timers`. |
| `periodSeconds` | Optional | `60` | Clamped to `1..86400`. |
| `autoOff` | Optional | `true` | Auto-reset switch state after pulse cycle. |
| `emitMotionPulse` | Optional | `true` | Emits motion pulse for compatible automations. |
| `persistState` | Optional | `false` | Persists state in accessory context cache. |

## `heartbeats[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `heartbeats`. |
| `enabled` | Optional | `true` | If `false`, heartbeat stays in config but no accessory is created. |
| `intervalSeconds` | Optional | `60` | Time between pulse starts, clamped to `1..86400`. |
| `pulseDurationSeconds` | Optional | `1` | Motion ON duration for each pulse, clamped to `1..86400`. Must be `<= intervalSeconds`. |
| `startupMode` | Optional | `wait` | `wait` = first pulse after one interval, `immediate` = pulse once on startup then continue schedule. |

Heartbeat notes:

- Each heartbeat creates a Motion Sensor accessory intended for HomeKit automations.
- Pulse behavior is `MotionDetected=true` for `pulseDurationSeconds`, then `false`.
- Multiple heartbeats are supported and run independently.

## `locks[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `locks`. |
| `defaultState` | Optional | `unlocked` | `locked` or `unlocked`. |
| `persistState` | Optional | `false` | Persists lock state in accessory context cache. |

## `securitySystems[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `securitySystems`. |
| `defaultState` | Optional | `unarmed` | `unarmed`, `armed-stay`, `armed-away`, `armed-night`. |
| `zones` | Optional | `["Alarm"]` | Empty or invalid entries are normalized away. |
| `armAwayButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `armStayButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `armNightButtonLabel` | Optional | `undefined` | Custom virtual control label. |
| `persistState` | Optional | `true` | Persists security state in accessory context cache. |

## `calendarTriggers[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Unique (case-insensitive) within `calendarTriggers`. |
| `url` | Required | - | `webcal://` is accepted and normalized to `https://`. |
| `updateIntervalMinutes` | Optional | `30` | Source-of-truth iCal refresh cadence, `1..1440`. |
| `requestTimeoutSeconds` | Optional | `15` | Fetch timeout, `1..120`. |
| `updateButton` | Optional | `true` | Adds a manual update switch for that calendar. |
| `triggerOnUpdates` | Optional | `true` | Pulse semantics for active-state updates. |
| `triggerOnAnyEvent` | Optional | `false` | If `false`, requires `events.length >= 1`. |
| `events[]` | Conditional | `[]` | Required when `triggerOnAnyEvent=false`. |

### `calendarTriggers[].events[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Display/key name. Legacy behavior also treats this as the regex pattern when `match` is omitted. |
| `match` | Optional (preferred) | `undefined` | Explicit event summary matcher object (`regex` or `literal`). |
| `triggerOnUpdates` | Optional | `true` | Pulse semantics for watched event accessory. |
| `notifications[]` | Optional | `[]` | Notification boundaries for matched events. |

### `calendarTriggers[].events[].notifications[]`

| Field | Required | Default | Notes |
|---|---|---|---|
| `name` | Required | - | Display label used in accessory naming. |
| `startOffsetMinutes` | Optional | `undefined` | Notification boundary relative to event start. |
| `endOffsetMinutes` | Optional | `undefined` | Notification boundary relative to event end. |

At least one of `startOffsetMinutes` or `endOffsetMinutes` is required per notification row.

## Regex Compatibility

- Legacy regex strings still work exactly as before.
- New matcher object form is available in:
  - `commandSwitches[].on|off|status.match`
  - `calendarTriggers[].events[].match`
- Matcher `mode` may be `regex` or `literal`.
- Calendar legacy `events[].name` matching keeps compatibility behavior:
  - invalid regex patterns fall back to exact literal matching and log a warning

Calendar matcher example:

```json
{
  "name": "Game Feed",
  "match": {
    "pattern": "^(GF|GFW|GT|GTW)$",
    "mode": "regex",
    "flags": "",
    "onInvalid": "literal-fallback"
  }
}
```

## `contextSensor`

| Field | Required | Default | Notes |
|---|---|---|---|
| `enabled` | Optional | `false` | Enables or disables the context sensor accessory. |
| `name` | Optional | `Home Context` | Accessory display name. |
| `latitude` | Conditional | `undefined` | Required when `enabled=true`, range `-90..90`. |
| `longitude` | Optional | `undefined` | Accepted but currently informational. |
| `refreshIntervalSeconds` | Optional | `60` | Clamped to `30..3600`. |

## Calendar Semantics

- One root accessory per calendar trigger
- One accessory per watched event definition
- One accessory per notification definition
- Active state is Contact Open (`CONTACT_NOT_DETECTED`)
- Inactive state is Contact Closed (`CONTACT_DETECTED`)
- iCal refresh cadence is controlled by `updateIntervalMinutes`
- A global deadline queue handles near-boundary notification triggering between refreshes
- Missed boundaries are only caught up if lateness is `<= 10 minutes`
- Processed event window is bounded to `24h` past and `48h` future

## Logging Contract

INFO logs include:

- effective accessory state transitions
- command switch auto-off schedule, cancel, and execute events
- calendar event deltas (`+`, `-`, `~`) and fired notification counts

DEBUG logs (`debug: true`) include:

- queue timing details and dedupe decisions
- command execution timing and polling internals
- calendar refresh windows and matching detail

## Consolidation Mapping

Typical migrations into this plugin:

- command-switch style plugins -> `commandSwitches`
- automation or momentary switch plugins -> `timers`
- calendar scheduler style plugins -> `calendarTriggers`
- calendar context accessory plugins -> `contextSensor`
- periodic heartbeat or ping plugins -> `heartbeats`

## Source of Truth

- Runtime config validation and Config UI schema: [`config.schema.json`](../config.schema.json)
- Implementation entrypoint: [`index.js`](../index.js)
