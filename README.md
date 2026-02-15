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

Configuration is managed via custom UI (`customUi: true`) to avoid schema-form placeholder row artifacts.

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
- Accessory queues are timeout-guarded to prevent indefinite lockups from hung operations.

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
- Calendar fetches are timeout-bounded (`calendarTriggers[].requestTimeoutSeconds`).
- Calendar trigger config UI is schema-driven; nested watched events and notifications are edited via auto-rendered nested array controls.
- When `calendarTriggers[].triggerOnAnyEvent` is `false`, at least one `calendarTriggers[].events[]` regex pattern is required.
- Calendar triggers are exposed as separate accessories for reliable HomeKit naming:
- root calendar trigger accessory (`calendarTriggers[].name`)
- watched event accessory (`calendar name + extracted regex label`)
- notification accessory (`calendar name + event label + notification name`)
- `debug: false` keeps logs minimal at info/warn/error level; set `debug: true` to enable verbose debug logs.
- No runtime pruning: partially configured rows fail fast with explicit validation errors.
- Custom UI creates rows only through explicit `Add ...` actions, so empty template rows are not auto-persisted.
- Custom UI uses native Homebridge Save only (no plugin-local save button); validation is live and invalid configs disable native Save.
- `contextSensor.latitude` and `contextSensor.longitude` are required only when `contextSensor.enabled` is `true`.
- Accessory metadata is auto-generated for all accessory kinds:
- `Manufacturer`: `Ultimate Switches`
- `Model`: type label (for example `Command Switch`, `Timer Switch`, `Calendar Trigger`)
- `SerialNumber`: deterministic UUID-derived value (`US-...`)
- Legacy command-switch metadata keys (`manufacturer`, `model`, `serialNumber`) are removed and now invalid.
- Manual smoke config example (including your public test calendar): `examples/manual-smoke.config.json`.
