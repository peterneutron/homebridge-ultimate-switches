'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeString(value, fallback) {
  return isNonEmptyString(value) ? value.trim() : fallback;
}

function ensureUniqueNames(items, groupName) {
  const seen = new Set();
  items.forEach((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) {
      throw new ValidationError(`${groupName} contains duplicate name: ${item.name}`);
    }
    seen.add(key);
  });
}

function normalizeCommandSwitches(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`commandSwitches[${index}].name is required`);
    }
    if (!isNonEmptyString(item?.onCommand)) {
      throw new ValidationError(`commandSwitches[${index}].onCommand is required`);
    }
    if (!isNonEmptyString(item?.offCommand)) {
      throw new ValidationError(`commandSwitches[${index}].offCommand is required`);
    }

    const normalized = {
      name: item.name.trim(),
      onCommand: item.onCommand.trim(),
      offCommand: item.offCommand.trim(),
      stateCommand: isNonEmptyString(item.stateCommand) ? item.stateCommand.trim() : undefined,
      polling: toBoolean(item.polling, false),
      pollIntervalSeconds: clampNumber(item.pollIntervalSeconds, 5, 1, 300),
      commandTimeoutSeconds: clampNumber(item.commandTimeoutSeconds, 2, 1, 120),
      manufacturer: normalizeString(item.manufacturer, undefined),
      model: normalizeString(item.model, undefined),
      serialNumber: normalizeString(item.serialNumber, undefined),
    };

    if (normalized.polling && !normalized.stateCommand) {
      throw new ValidationError(`commandSwitches[${index}] requires stateCommand when polling is enabled`);
    }

    return normalized;
  });

  ensureUniqueNames(items, 'commandSwitches');
  return items;
}

function normalizeBasicSwitches(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`switches[${index}].name is required`);
    }

    return {
      name: item.name.trim(),
      defaultOn: toBoolean(item.defaultOn, false),
      persistState: toBoolean(item.persistState, false),
    };
  });

  ensureUniqueNames(items, 'switches');
  return items;
}

function normalizeTimers(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`timers[${index}].name is required`);
    }

    return {
      name: item.name.trim(),
      periodSeconds: clampNumber(item.periodSeconds, 60, 1, 86400),
      autoOff: toBoolean(item.autoOff, true),
      emitMotionPulse: toBoolean(item.emitMotionPulse, true),
      persistState: toBoolean(item.persistState, false),
    };
  });

  ensureUniqueNames(items, 'timers');
  return items;
}

function normalizeLocks(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`locks[${index}].name is required`);
    }

    const defaultState = item?.defaultState === 'locked' ? 'locked' : 'unlocked';

    return {
      name: item.name.trim(),
      defaultState,
      persistState: toBoolean(item.persistState, false),
    };
  });

  ensureUniqueNames(items, 'locks');
  return items;
}

function normalizeSecuritySystems(raw) {
  const states = new Set(['unarmed', 'armed-stay', 'armed-away', 'armed-night']);

  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`securitySystems[${index}].name is required`);
    }

    const defaultState = isNonEmptyString(item.defaultState) && states.has(item.defaultState)
      ? item.defaultState
      : 'unarmed';

    const zoneValues = asArray(item.zones)
      .map((zone) => (isNonEmptyString(zone) ? zone.trim() : ''))
      .filter(Boolean);
    const zones = zoneValues.length ? Array.from(new Set(zoneValues)) : ['Alarm'];

    return {
      name: item.name.trim(),
      defaultState,
      zones,
      armAwayButtonLabel: normalizeString(item.armAwayButtonLabel, undefined),
      armStayButtonLabel: normalizeString(item.armStayButtonLabel, undefined),
      armNightButtonLabel: normalizeString(item.armNightButtonLabel, undefined),
      persistState: toBoolean(item.persistState, true),
    };
  });

  ensureUniqueNames(items, 'securitySystems');
  return items;
}

function normalizeNotifications(raw, path) {
  return asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`${path}[${index}].name is required`);
    }

    const hasStart = Number.isFinite(Number(item.startOffsetMinutes));
    const hasEnd = Number.isFinite(Number(item.endOffsetMinutes));
    if (!hasStart && !hasEnd) {
      throw new ValidationError(`${path}[${index}] requires startOffsetMinutes or endOffsetMinutes`);
    }

    return {
      name: item.name.trim(),
      startOffsetMinutes: hasStart ? Math.round(Number(item.startOffsetMinutes)) : undefined,
      endOffsetMinutes: hasEnd ? Math.round(Number(item.endOffsetMinutes)) : undefined,
    };
  });
}

function normalizeCalendarEvents(raw, path) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`${path}[${index}].name is required`);
    }

    return {
      name: item.name.trim(),
      triggerOnUpdates: toBoolean(item.triggerOnUpdates, true),
      notifications: normalizeNotifications(item.notifications, `${path}[${index}].notifications`),
    };
  });

  ensureUniqueNames(items, path);
  return items;
}

function normalizeCalendarTriggers(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`calendarTriggers[${index}].name is required`);
    }
    if (!isNonEmptyString(item?.url)) {
      throw new ValidationError(`calendarTriggers[${index}].url is required`);
    }

    return {
      name: item.name.trim(),
      url: item.url.trim(),
      updateIntervalMinutes: clampNumber(item.updateIntervalMinutes, 60, 1, 1440),
      updateButton: toBoolean(item.updateButton, true),
      triggerOnUpdates: toBoolean(item.triggerOnUpdates, true),
      triggerOnAnyEvent: toBoolean(item.triggerOnAnyEvent, false),
      events: normalizeCalendarEvents(item.events, `calendarTriggers[${index}].events`),
    };
  });

  ensureUniqueNames(items, 'calendarTriggers');
  return items;
}

function normalizeContextSensor(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const enabled = toBoolean(source.enabled, false);
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);

  if (enabled) {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ValidationError('contextSensor.latitude must be a number between -90 and 90 when enabled');
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ValidationError('contextSensor.longitude must be a number between -180 and 180 when enabled');
    }
  }

  return {
    enabled,
    name: normalizeString(source.name, 'Home Context'),
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    refreshIntervalSeconds: clampNumber(source.refreshIntervalSeconds, 60, 30, 3600),
  };
}

function normalizeConfig(rawConfig) {
  const raw = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  return {
    name: normalizeString(raw.name, 'Ultimate Switches'),
    debug: toBoolean(raw.debug, false),
    commandSwitches: normalizeCommandSwitches(raw.commandSwitches),
    switches: normalizeBasicSwitches(raw.switches),
    timers: normalizeTimers(raw.timers),
    locks: normalizeLocks(raw.locks),
    securitySystems: normalizeSecuritySystems(raw.securitySystems),
    calendarTriggers: normalizeCalendarTriggers(raw.calendarTriggers),
    contextSensor: normalizeContextSensor(raw.contextSensor),
  };
}

module.exports = {
  ValidationError,
  normalizeConfig,
};
