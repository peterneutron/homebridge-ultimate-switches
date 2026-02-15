# homebridge-ultimate-switches

Unified automation switches and trigger primitives for Homebridge 1.x and 2.x.

Current status: runtime scaffold + normalized configuration contract are in place.
Implemented accessory families:

- `commandSwitches[]`
- `switches[]`
- `timers[]`
- `locks[]`
- `securitySystems[]`
- `calendarTriggers[]`
- `contextSensor`

## Platform

Use platform name:

- `UltimateSwitches`

## Config Schema

Config UI X schema is at:

- `config.schema.json`

Core v1 groups:

- `commandSwitches[]`
- `switches[]`
- `timers[]`
- `locks[]`
- `securitySystems[]`
- `calendarTriggers[]`
- `contextSensor`

Non-blocking behavior:

- Operations are serialized per accessory key.
- Different accessories run concurrently, so one long-running operation does not block unrelated switches/events.

## Development

```bash
npm install
npm test
```

## Notes

- `legacy/` is intentionally not tracked by this repository.
- Phase 1 and Phase 2 planning artifacts live in `docs/`.
- Calendar parsing uses `node-ical` (installed as dependency).
- `webcal://` URLs are supported and normalized to `https://` at runtime.
- Manual smoke config example (including your public test calendar): `examples/manual-smoke.config.json`.
