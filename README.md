# homebridge-ultimate-switches

`homebridge-ultimate-switches` is a unified Homebridge plugin for command switches, virtual switches, timers, heartbeat triggers, locks, security systems, calendar-driven accessories, and a context sensor.

- Platform: `UltimateSwitches`
- Homebridge: `^1.6.0 || ^2.0.0-beta.0`
- Node.js: `^18.20.4 || ^20.15.1 || ^22`
- Config UI: Custom Config UI X page (`customUi: true`)

## What It Covers

- Command and webhook-backed switches with optional polling, matching, and auto-off
- Basic virtual switches
- Timer and momentary switches
- Heartbeat motion triggers for repeat automations
- Virtual locks
- Virtual security systems with optional zones and arming helpers
- Calendar root, watched-event, and notification accessories
- Context sensor for month, ISO week, season, and time-of-day families

## Install

```bash
npm i -g homebridge-ultimate-switches
```

Then add platform `UltimateSwitches` in Homebridge Config UI X.

## Quick Start

Minimal valid platform block:

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

## Configuration Overview

- `commandSwitches[]`: shell commands or webhooks for `on`, `off`, and optional `status`
- `switches[]`: persistent or non-persistent virtual switches
- `timers[]`: pulse-style switches with optional auto-off and motion emission
- `heartbeats[]`: periodic motion pulses for automations
- `locks[]`: virtual HomeKit locks
- `securitySystems[]`: virtual alarm systems with optional zones and arm button labels
- `calendarTriggers[]`: iCal/webcal-driven accessories for calendars, matched events, and notification boundaries
- `contextSensor`: time/date context accessory

Example command switch:

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

Legacy config remains supported. For example, `onCommand`/`offCommand`/`stateCommand` still work, but the preferred form is `on`/`off`/`status`.

## Docs

- Contract and config reference: [`docs/contracts.md`](docs/contracts.md)
- Release process: [`docs/release.md`](docs/release.md)
- Agent instructions: [`AGENTS.md`](AGENTS.md)

## Development

```bash
npm install
npm test
npm run verify
```

`npm run verify` runs the test suite and checks the npm publish contents with `npm pack --dry-run`.
