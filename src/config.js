'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const NORMALIZATION_META = Symbol('normalizationMeta');

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

function isDefaultBoolean(value, fallback) {
  return typeof value !== 'boolean' || value === fallback;
}

function isDefaultNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  const n = Number(value);
  return Number.isFinite(n) && n === fallback;
}

function normalizeZoneValues(rawZones) {
  return asArray(rawZones)
    .map((zone) => (isNonEmptyString(zone) ? zone.trim() : ''))
    .filter(Boolean);
}

function isDefaultZones(rawZones) {
  const zones = normalizeZoneValues(rawZones);
  if (!zones.length) {
    return true;
  }

  return zones.length === 1 && zones[0] === 'Alarm';
}

function incrementPruneCounter(counters, key) {
  counters[key] = (counters[key] || 0) + 1;
}

function isBlankCommandSwitchRow(item) {
  return !isNonEmptyString(item?.name)
    && !isNonEmptyString(item?.onCommand)
    && !isNonEmptyString(item?.offCommand)
    && !isNonEmptyString(item?.stateCommand)
    && isDefaultBoolean(item?.polling, false)
    && isDefaultNumber(item?.pollIntervalSeconds, 5)
    && isDefaultNumber(item?.commandTimeoutSeconds, 2);
}

function isBlankSwitchRow(item) {
  return !isNonEmptyString(item?.name)
    && isDefaultBoolean(item?.defaultOn, false)
    && isDefaultBoolean(item?.persistState, false);
}

function isBlankTimerRow(item) {
  return !isNonEmptyString(item?.name)
    && isDefaultNumber(item?.periodSeconds, 60)
    && isDefaultBoolean(item?.autoOff, true)
    && isDefaultBoolean(item?.emitMotionPulse, true)
    && isDefaultBoolean(item?.persistState, false);
}

function isBlankLockRow(item) {
  return !isNonEmptyString(item?.name)
    && (!isNonEmptyString(item?.defaultState) || item.defaultState === 'unlocked')
    && isDefaultBoolean(item?.persistState, false);
}

function isBlankSecuritySystemRow(item) {
  return !isNonEmptyString(item?.name)
    && (!isNonEmptyString(item?.defaultState) || item.defaultState === 'unarmed')
    && !isNonEmptyString(item?.armAwayButtonLabel)
    && !isNonEmptyString(item?.armStayButtonLabel)
    && !isNonEmptyString(item?.armNightButtonLabel)
    && isDefaultBoolean(item?.persistState, true)
    && isDefaultZones(item?.zones);
}

function isBlankNotificationRow(item) {
  return !isNonEmptyString(item?.name)
    && (item?.startOffsetMinutes === undefined || item.startOffsetMinutes === null || item.startOffsetMinutes === '')
    && (item?.endOffsetMinutes === undefined || item.endOffsetMinutes === null || item.endOffsetMinutes === '');
}

function hasOnlyBlankNotificationRows(raw) {
  const notifications = asArray(raw);
  return notifications.length > 0 && notifications.every((item) => isBlankNotificationRow(item));
}

function isBlankCalendarEventRow(item) {
  return !isNonEmptyString(item?.name)
    && isDefaultBoolean(item?.triggerOnUpdates, true)
    && (asArray(item?.notifications).length === 0 || hasOnlyBlankNotificationRows(item?.notifications));
}

function isBlankCalendarTriggerRow(item) {
  const events = asArray(item?.events);

  return !isNonEmptyString(item?.name)
    && !isNonEmptyString(item?.url)
    && isDefaultNumber(item?.updateIntervalMinutes, 60)
    && isDefaultNumber(item?.requestTimeoutSeconds, 15)
    && isDefaultBoolean(item?.updateButton, true)
    && isDefaultBoolean(item?.triggerOnUpdates, true)
    && isDefaultBoolean(item?.triggerOnAnyEvent, false)
    && (events.length === 0 || events.every((event) => isBlankCalendarEventRow(event)));
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

function normalizeCommandSwitches(raw, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankCommandSwitchRow(item)) {
      incrementPruneCounter(pruneCounters, 'commandSwitches');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`commandSwitches[${index}].name is required`);
    }
    if (!isNonEmptyString(item?.onCommand)) {
      throw new ValidationError(`commandSwitches[${index}].onCommand is required`);
    }
    if (!isNonEmptyString(item?.offCommand)) {
      throw new ValidationError(`commandSwitches[${index}].offCommand is required`);
    }
    if (Object.hasOwn(item || {}, 'manufacturer')) {
      throw new ValidationError(`commandSwitches[${index}].manufacturer is no longer supported`);
    }
    if (Object.hasOwn(item || {}, 'model')) {
      throw new ValidationError(`commandSwitches[${index}].model is no longer supported`);
    }
    if (Object.hasOwn(item || {}, 'serialNumber')) {
      throw new ValidationError(`commandSwitches[${index}].serialNumber is no longer supported`);
    }

    const normalized = {
      name: item.name.trim(),
      onCommand: item.onCommand.trim(),
      offCommand: item.offCommand.trim(),
      stateCommand: isNonEmptyString(item.stateCommand) ? item.stateCommand.trim() : undefined,
      polling: toBoolean(item.polling, false),
      pollIntervalSeconds: clampNumber(item.pollIntervalSeconds, 5, 1, 300),
      commandTimeoutSeconds: clampNumber(item.commandTimeoutSeconds, 2, 1, 120),
    };

    if (normalized.polling && !normalized.stateCommand) {
      throw new ValidationError(`commandSwitches[${index}] requires stateCommand when polling is enabled`);
    }

    items.push(normalized);
  });

  ensureUniqueNames(items, 'commandSwitches');
  return items;
}

function normalizeBasicSwitches(raw, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankSwitchRow(item)) {
      incrementPruneCounter(pruneCounters, 'switches');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`switches[${index}].name is required`);
    }

    items.push({
      name: item.name.trim(),
      defaultOn: toBoolean(item.defaultOn, false),
      persistState: toBoolean(item.persistState, false),
    });
  });

  ensureUniqueNames(items, 'switches');
  return items;
}

function normalizeTimers(raw, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankTimerRow(item)) {
      incrementPruneCounter(pruneCounters, 'timers');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`timers[${index}].name is required`);
    }

    items.push({
      name: item.name.trim(),
      periodSeconds: clampNumber(item.periodSeconds, 60, 1, 86400),
      autoOff: toBoolean(item.autoOff, true),
      emitMotionPulse: toBoolean(item.emitMotionPulse, true),
      persistState: toBoolean(item.persistState, false),
    });
  });

  ensureUniqueNames(items, 'timers');
  return items;
}

function normalizeLocks(raw, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankLockRow(item)) {
      incrementPruneCounter(pruneCounters, 'locks');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`locks[${index}].name is required`);
    }

    const defaultState = item?.defaultState === 'locked' ? 'locked' : 'unlocked';

    items.push({
      name: item.name.trim(),
      defaultState,
      persistState: toBoolean(item.persistState, false),
    });
  });

  ensureUniqueNames(items, 'locks');
  return items;
}

function normalizeSecuritySystems(raw, pruneCounters) {
  const states = new Set(['unarmed', 'armed-stay', 'armed-away', 'armed-night']);

  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankSecuritySystemRow(item)) {
      incrementPruneCounter(pruneCounters, 'securitySystems');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`securitySystems[${index}].name is required`);
    }

    const defaultState = isNonEmptyString(item.defaultState) && states.has(item.defaultState)
      ? item.defaultState
      : 'unarmed';

    const zoneValues = normalizeZoneValues(item.zones);
    const zones = zoneValues.length ? Array.from(new Set(zoneValues)) : ['Alarm'];

    items.push({
      name: item.name.trim(),
      defaultState,
      zones,
      armAwayButtonLabel: normalizeString(item.armAwayButtonLabel, undefined),
      armStayButtonLabel: normalizeString(item.armStayButtonLabel, undefined),
      armNightButtonLabel: normalizeString(item.armNightButtonLabel, undefined),
      persistState: toBoolean(item.persistState, true),
    });
  });

  ensureUniqueNames(items, 'securitySystems');
  return items;
}

function normalizeNotifications(raw, path, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankNotificationRow(item)) {
      incrementPruneCounter(pruneCounters, 'notifications');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`${path}[${index}].name is required`);
    }

    const hasStart = Number.isFinite(Number(item.startOffsetMinutes));
    const hasEnd = Number.isFinite(Number(item.endOffsetMinutes));
    if (!hasStart && !hasEnd) {
      throw new ValidationError(`${path}[${index}] requires startOffsetMinutes or endOffsetMinutes`);
    }

    items.push({
      name: item.name.trim(),
      startOffsetMinutes: hasStart ? Math.round(Number(item.startOffsetMinutes)) : undefined,
      endOffsetMinutes: hasEnd ? Math.round(Number(item.endOffsetMinutes)) : undefined,
    });
  });

  return items;
}

function normalizeCalendarEvents(raw, path, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankCalendarEventRow(item)) {
      incrementPruneCounter(pruneCounters, 'calendarEvents');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`${path}[${index}].name is required`);
    }

    items.push({
      name: item.name.trim(),
      triggerOnUpdates: toBoolean(item.triggerOnUpdates, true),
      notifications: normalizeNotifications(item.notifications, `${path}[${index}].notifications`, pruneCounters),
    });
  });

  ensureUniqueNames(items, path);
  return items;
}

function normalizeCalendarTriggers(raw, pruneCounters) {
  const items = [];
  asArray(raw).forEach((item, index) => {
    if (isBlankCalendarTriggerRow(item)) {
      incrementPruneCounter(pruneCounters, 'calendarTriggers');
      return;
    }

    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`calendarTriggers[${index}].name is required`);
    }
    if (!isNonEmptyString(item?.url)) {
      throw new ValidationError(`calendarTriggers[${index}].url is required`);
    }

    const normalized = {
      name: item.name.trim(),
      url: item.url.trim(),
      updateIntervalMinutes: clampNumber(item.updateIntervalMinutes, 60, 1, 1440),
      requestTimeoutSeconds: clampNumber(item.requestTimeoutSeconds, 15, 1, 120),
      updateButton: toBoolean(item.updateButton, true),
      triggerOnUpdates: toBoolean(item.triggerOnUpdates, true),
      triggerOnAnyEvent: toBoolean(item.triggerOnAnyEvent, false),
      events: normalizeCalendarEvents(item.events, `calendarTriggers[${index}].events`, pruneCounters),
    };

    if (normalized.triggerOnAnyEvent === false && normalized.events.length === 0) {
      throw new ValidationError(`calendarTriggers[${index}] requires at least one events entry when triggerOnAnyEvent is false`);
    }

    items.push(normalized);
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
  const pruneCounters = {};

  const normalized = {
    name: normalizeString(raw.name, 'Ultimate Switches'),
    debug: toBoolean(raw.debug, false),
    commandSwitches: normalizeCommandSwitches(raw.commandSwitches, pruneCounters),
    switches: normalizeBasicSwitches(raw.switches, pruneCounters),
    timers: normalizeTimers(raw.timers, pruneCounters),
    locks: normalizeLocks(raw.locks, pruneCounters),
    securitySystems: normalizeSecuritySystems(raw.securitySystems, pruneCounters),
    calendarTriggers: normalizeCalendarTriggers(raw.calendarTriggers, pruneCounters),
    contextSensor: normalizeContextSensor(raw.contextSensor),
  };

  Object.defineProperty(normalized, NORMALIZATION_META, {
    value: { pruneCounters },
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return normalized;
}

function getNormalizationMeta(config) {
  if (!config || typeof config !== 'object') {
    return { pruneCounters: {} };
  }

  return config[NORMALIZATION_META] || { pruneCounters: {} };
}

module.exports = {
  ValidationError,
  getNormalizationMeta,
  normalizeConfig,
};
