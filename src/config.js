'use strict';

const { compileRegexOrThrow } = require('./regexUtils');

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

function normalizeZoneValues(rawZones) {
  return asArray(rawZones)
    .map((zone) => (isNonEmptyString(zone) ? zone.trim() : ''))
    .filter(Boolean);
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isWebhookShorthand(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    return true;
  }
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(input)) {
    return true;
  }
  if (/^\[[0-9a-f:]+\](?::\d+)?(?:\/.*)?$/i.test(input)) {
    return true;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/i.test(input)) {
    const host = input.split(/[/:]/, 1)[0];
    const octets = host.split('.').map(Number);
    return octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  }
  return false;
}

function normalizeWebhookUrl(input) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

function validateRegexConfig(path, pattern, flags) {
  if (!isNonEmptyString(pattern)) {
    return;
  }
  if (flags !== undefined && typeof flags !== 'string') {
    throw new ValidationError(`${path}.matchFlags must be a string when provided`);
  }
  try {
    compileRegexOrThrow(pattern, flags || '', path);
  } catch (error) {
    throw new ValidationError(`${path}.matchPattern is invalid: ${error.message}`);
  }
}

function normalizeActionValue(rawValue, path) {
  if (rawValue === undefined) {
    return undefined;
  }

  let source;
  if (isNonEmptyString(rawValue)) {
    source = { input: rawValue.trim(), type: 'auto' };
  } else if (isPlainObject(rawValue)) {
    source = rawValue;
  } else {
    throw new ValidationError(`${path} must be a string or object`);
  }

  if (!isNonEmptyString(source.input)) {
    throw new ValidationError(`${path}.input is required`);
  }

  const requestedType = isNonEmptyString(source.type) ? source.type.trim().toLowerCase() : 'auto';
  if (!['auto', 'command', 'webhook'].includes(requestedType)) {
    throw new ValidationError(`${path}.type must be one of auto, command, webhook`);
  }

  const autoDetectedWebhook = requestedType === 'auto' && isWebhookShorthand(source.input);
  const transport = requestedType === 'command'
    ? 'command'
    : (requestedType === 'webhook' || autoDetectedWebhook ? 'webhook' : 'command');

  const normalized = {
    input: transport === 'webhook' ? normalizeWebhookUrl(source.input) : source.input.trim(),
    transport,
    method: undefined,
    headers: undefined,
    body: undefined,
    matchPattern: undefined,
    matchFlags: undefined,
    matchInvert: toBoolean(source.matchInvert, false),
  };

  if (source.matchPattern !== undefined) {
    if (!isNonEmptyString(source.matchPattern)) {
      throw new ValidationError(`${path}.matchPattern must be a non-empty string when provided`);
    }
    normalized.matchPattern = source.matchPattern.trim();
    normalized.matchFlags = typeof source.matchFlags === 'string' ? source.matchFlags : undefined;
    validateRegexConfig(path, normalized.matchPattern, normalized.matchFlags);
  } else if (source.matchFlags !== undefined) {
    throw new ValidationError(`${path}.matchFlags requires matchPattern`);
  }

  if (transport === 'webhook') {
    if (source.method !== undefined && !isNonEmptyString(source.method)) {
      throw new ValidationError(`${path}.method must be GET or POST`);
    }
    const method = isNonEmptyString(source.method) ? source.method.trim().toUpperCase() : 'GET';
    if (!['GET', 'POST'].includes(method)) {
      throw new ValidationError(`${path}.method must be GET or POST`);
    }
    normalized.method = method;

    if (source.headers !== undefined) {
      if (!isPlainObject(source.headers)) {
        throw new ValidationError(`${path}.headers must be an object`);
      }
      const headers = {};
      Object.entries(source.headers).forEach(([key, value]) => {
        if (!isNonEmptyString(key)) {
          throw new ValidationError(`${path}.headers keys must be non-empty strings`);
        }
        if (typeof value !== 'string') {
          throw new ValidationError(`${path}.headers.${key} must be a string`);
        }
        headers[key] = value;
      });
      normalized.headers = headers;
    }

    if (source.body !== undefined) {
      if (typeof source.body !== 'string') {
        throw new ValidationError(`${path}.body must be a string`);
      }
      normalized.body = source.body;
    }
  } else {
    if (source.method !== undefined) {
      throw new ValidationError(`${path}.method is only valid for webhook actions`);
    }
    if (source.headers !== undefined) {
      throw new ValidationError(`${path}.headers is only valid for webhook actions`);
    }
    if (source.body !== undefined) {
      throw new ValidationError(`${path}.body is only valid for webhook actions`);
    }
  }

  return normalized;
}

function normalizeCommandSwitchAction(item, index, fieldName, legacyFieldName) {
  const path = `commandSwitches[${index}].${fieldName}`;
  const hasNew = Object.hasOwn(item || {}, fieldName);
  const hasLegacy = Object.hasOwn(item || {}, legacyFieldName);
  if (hasNew && hasLegacy) {
    throw new ValidationError(`${path} cannot be combined with ${legacyFieldName}`);
  }
  if (hasNew) {
    return normalizeActionValue(item[fieldName], path);
  }
  if (hasLegacy) {
    if (!isNonEmptyString(item[legacyFieldName])) {
      if (legacyFieldName === 'offCommand') {
        return undefined;
      }
      throw new ValidationError(`commandSwitches[${index}].${legacyFieldName} must be a non-empty string`);
    }
    return normalizeActionValue(item[legacyFieldName].trim(), path);
  }
  return undefined;
}

function normalizeCommandSwitches(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`commandSwitches[${index}].name is required`);
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

    const onAction = normalizeCommandSwitchAction(item, index, 'on', 'onCommand');
    const offAction = normalizeCommandSwitchAction(item, index, 'off', 'offCommand');
    const statusAction = normalizeCommandSwitchAction(item, index, 'status', 'stateCommand');
    if (!onAction) {
      throw new ValidationError(`commandSwitches[${index}].on or onCommand is required`);
    }

    const normalized = {
      name: item.name.trim(),
      actions: {
        on: onAction,
        off: offAction,
        status: statusAction,
      },
      polling: toBoolean(item.polling, false),
      pollIntervalSeconds: clampNumber(item.pollIntervalSeconds, 5, 1, 300),
      commandTimeoutSeconds: clampNumber(item.commandTimeoutSeconds, 5, 1, 120),
      autoOffSeconds: isNonEmptyString(item.autoOffSeconds) || Number.isFinite(Number(item.autoOffSeconds))
        ? clampNumber(item.autoOffSeconds, 1, 1, 86400)
        : undefined,
    };

    if (normalized.polling && !normalized.actions.status) {
      throw new ValidationError(`commandSwitches[${index}] requires status or stateCommand when polling is enabled`);
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

function normalizeHeartbeats(raw) {
  const items = asArray(raw).map((item, index) => {
    if (!isNonEmptyString(item?.name)) {
      throw new ValidationError(`heartbeats[${index}].name is required`);
    }

    const startupMode = isNonEmptyString(item.startupMode) ? item.startupMode.trim() : 'wait';
    if (!['wait', 'immediate'].includes(startupMode)) {
      throw new ValidationError(`heartbeats[${index}].startupMode must be wait or immediate`);
    }

    const normalized = {
      name: item.name.trim(),
      enabled: toBoolean(item.enabled, true),
      intervalSeconds: clampNumber(item.intervalSeconds, 60, 1, 86400),
      pulseDurationSeconds: clampNumber(item.pulseDurationSeconds, 1, 1, 86400),
      startupMode,
    };

    if (normalized.pulseDurationSeconds > normalized.intervalSeconds) {
      throw new ValidationError(`heartbeats[${index}].pulseDurationSeconds must be <= intervalSeconds`);
    }

    return normalized;
  });

  ensureUniqueNames(items, 'heartbeats');
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

    const zoneValues = normalizeZoneValues(item.zones);
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

    const normalized = {
      name: item.name.trim(),
      url: item.url.trim(),
      updateIntervalMinutes: clampNumber(item.updateIntervalMinutes, 30, 1, 1440),
      requestTimeoutSeconds: clampNumber(item.requestTimeoutSeconds, 15, 1, 120),
      updateButton: toBoolean(item.updateButton, true),
      triggerOnUpdates: toBoolean(item.triggerOnUpdates, true),
      triggerOnAnyEvent: toBoolean(item.triggerOnAnyEvent, false),
      events: normalizeCalendarEvents(item.events, `calendarTriggers[${index}].events`),
    };

    if (normalized.triggerOnAnyEvent === false && normalized.events.length === 0) {
      throw new ValidationError(`calendarTriggers[${index}] requires at least one events entry when triggerOnAnyEvent is false`);
    }

    return normalized;
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
    heartbeats: normalizeHeartbeats(raw.heartbeats),
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
