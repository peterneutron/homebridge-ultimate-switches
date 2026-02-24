'use strict';

const { CalendarProvider } = require('./calendarProvider');
const { computeProgress, isEventActive } = require('./calendarLogic');
const { buildCalendarEventKey, buildCalendarNotificationKey } = require('./calendarKeys');
const { formatCalendarDelta } = require('./logger');
const { compileRegexSpec } = require('./regexUtils');

const PULSE_MS = 10000;
const MAX_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;
const EVENT_PAST_WINDOW_MS = 24 * 60 * 60 * 1000;
const EVENT_FUTURE_WINDOW_MS = 48 * 60 * 60 * 1000;
const FIRED_BOUNDARY_TTL_MS = 24 * 60 * 60 * 1000;

function safeRegexSpec(spec, log, label, legacyPatternForWarning) {
  return compileRegexSpec(spec, {
    log,
    label,
    warnMessage(targetLog) {
      targetLog.warn(
        '[Calendar:%s] Invalid regex pattern "%s"; using exact match fallback',
        label,
        legacyPatternForWarning ?? spec?.pattern,
      );
    },
  });
}

function buildSummaryBuckets(events) {
  const buckets = new Map();
  events.forEach((event) => {
    const key = String(event.summary || '');
    if (!buckets.has(key)) {
      buckets.set(key, new Set());
    }
    buckets.get(key).add(`${event.startMs}|${event.endMs}`);
  });
  return buckets;
}

function computeEventDelta(previousEvents, nextEvents) {
  const previousSet = new Set(previousEvents.map((event) => `${event.summary}|${event.startMs}|${event.endMs}`));
  const nextSet = new Set(nextEvents.map((event) => `${event.summary}|${event.startMs}|${event.endMs}`));

  let added = 0;
  let removed = 0;
  nextSet.forEach((key) => {
    if (!previousSet.has(key)) {
      added += 1;
    }
  });
  previousSet.forEach((key) => {
    if (!nextSet.has(key)) {
      removed += 1;
    }
  });

  const previousBuckets = buildSummaryBuckets(previousEvents);
  const nextBuckets = buildSummaryBuckets(nextEvents);
  let changed = 0;
  nextBuckets.forEach((nextTimes, summary) => {
    if (!previousBuckets.has(summary)) {
      return;
    }
    const previousTimes = previousBuckets.get(summary);
    if (previousTimes.size !== nextTimes.size) {
      changed += 1;
      return;
    }
    for (const value of nextTimes) {
      if (!previousTimes.has(value)) {
        changed += 1;
        return;
      }
    }
  });

  return { added, removed, changed };
}

class CalendarEngine {
  constructor(log, calendarConfig, provider = null, clock = () => Date.now(), timers = {}, persistence = {}, deadlineQueue = null) {
    this.log = log;
    this.config = calendarConfig;
    this.provider = provider || new CalendarProvider(log);
    this.clock = clock;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;
    this.getPersistedLastPollMs = typeof persistence.getPersistedLastPollMs === 'function'
      ? persistence.getPersistedLastPollMs
      : () => null;
    this.setPersistedLastPollMs = typeof persistence.setPersistedLastPollMs === 'function'
      ? persistence.setPersistedLastPollMs
      : () => {};
    this.getPersistedBoundaryFireMap = typeof persistence.getPersistedBoundaryFireMap === 'function'
      ? persistence.getPersistedBoundaryFireMap
      : () => ({});
    this.setPersistedBoundaryFireMap = typeof persistence.setPersistedBoundaryFireMap === 'function'
      ? persistence.setPersistedBoundaryFireMap
      : () => {};
    this.deadlineQueue = deadlineQueue;

    this.started = false;
    this.stopped = false;
    this.pollTimer = null;
    this.refreshing = false;
    this.queuedRefresh = false;
    this.lastPollMs = null;

    this.mainActive = false;
    this.eventStates = new Map();
    this.notificationStates = new Map();

    this.rootSubscribers = new Set();
    this.eventSubscribers = new Map();
    this.notificationSubscribers = new Map();
    this.pulseTimers = new Map();
    this.previousEvents = [];
    this.firedBoundaryMap = this._hydrateBoundaryMap(this.getPersistedBoundaryFireMap());

    this.eventDefs = this.config.events.map((event) => {
      const eventKey = buildCalendarEventKey(this.config.name, event.name);
      const notifications = event.notifications.map((notification) => {
        const notificationKey = buildCalendarNotificationKey(this.config.name, event.name, notification.name);
        return {
          ...notification,
          notificationKey,
        };
      });

      return {
        ...event,
        regex: safeRegexSpec(
          event.match || {
            pattern: event.name,
            mode: 'regex',
            flags: '',
            invert: false,
            onInvalid: 'literal-fallback',
          },
          this.log,
          this.config.name,
          event.name,
        ),
        eventKey,
        notifications,
      };
    });

    if (this.deadlineQueue) {
      this.deadlineQueue.registerCalendar(this.config.name, (deadline, meta) => {
        this.handleDeadline(deadline, meta);
      });
    }
  }

  start() {
    if (this.started || this.stopped) {
      return;
    }
    this.started = true;
    void this.refreshNow().catch((error) => {
      this.log.debug('[Calendar:%s] Initial refresh failed: %s', this.config.name, error.message);
    });
    this.scheduleNextPoll();
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timeout of this.pulseTimers.values()) {
      this.clearTimeoutFn(timeout);
    }
    this.pulseTimers.clear();
    if (this.deadlineQueue) {
      this.deadlineQueue.removeCalendar(this.config.name);
    }
  }

  scheduleNextPoll() {
    if (this.stopped) {
      return;
    }
    if (this.pollTimer) {
      this.clearTimeoutFn(this.pollTimer);
    }
    this.pollTimer = this.setTimeoutFn(() => {
      void this.refreshNow()
        .catch((error) => {
          this.log.warn('[Calendar:%s] Poll refresh failed: %s', this.config.name, error.message);
        })
        .finally(() => {
          this.scheduleNextPoll();
        });
    }, this.config.updateIntervalMinutes * 60000);
  }

  _hydrateBoundaryMap(raw) {
    const nowMs = this.clock();
    const source = raw && typeof raw === 'object' ? raw : {};
    const map = new Map();
    Object.entries(source).forEach(([id, timestamp]) => {
      const firedAtMs = Number(timestamp);
      if (!Number.isFinite(firedAtMs)) {
        return;
      }
      if ((nowMs - firedAtMs) <= FIRED_BOUNDARY_TTL_MS) {
        map.set(id, firedAtMs);
      }
    });
    return map;
  }

  _persistBoundaryMap() {
    const payload = {};
    this.firedBoundaryMap.forEach((timestamp, id) => {
      payload[id] = timestamp;
    });
    this.setPersistedBoundaryFireMap(payload);
  }

  _pruneBoundaryMap(nowMs) {
    this.firedBoundaryMap.forEach((timestamp, id) => {
      if ((nowMs - timestamp) > FIRED_BOUNDARY_TTL_MS) {
        this.firedBoundaryMap.delete(id);
      }
    });
  }

  _isBoundaryRecentlyFired(id, nowMs) {
    const firedAtMs = this.firedBoundaryMap.get(id);
    return Number.isFinite(firedAtMs) && ((nowMs - firedAtMs) <= FIRED_BOUNDARY_TTL_MS);
  }

  _markBoundaryFired(id, nowMs) {
    this.firedBoundaryMap.set(id, nowMs);
    this._pruneBoundaryMap(nowMs);
    this._persistBoundaryMap();
  }

  _latencyBucket(latenessMs) {
    if (latenessMs <= 1000) {
      return '<=1s';
    }
    if (latenessMs <= 10000) {
      return '<=10s';
    }
    if (latenessMs <= 60000) {
      return '<=1m';
    }
    return '<=10m';
  }

  _buildBoundaryId(notificationKey, boundaryMs, boundaryType, eventSignature) {
    return `${this.config.name}|${notificationKey}|${boundaryMs}|${boundaryType}|${eventSignature}`;
  }

  _buildBoundariesForMatches(matchesByDef, nowMs) {
    const boundaries = [];
    matchesByDef.forEach(({ def, allMatches }) => {
      def.notifications.forEach((notification) => {
        allMatches.forEach((event) => {
          const eventSignature = `${event.summary}|${event.startMs}|${event.endMs}`;
          if (Number.isFinite(notification.startOffsetMinutes)) {
            const boundaryMs = event.startMs + (notification.startOffsetMinutes * 60000);
            boundaries.push({
              id: this._buildBoundaryId(notification.notificationKey, boundaryMs, 'startOffset', eventSignature),
              calendarName: this.config.name,
              notificationKey: notification.notificationKey,
              dueMs: boundaryMs,
              eventSignature,
              boundaryType: 'startOffset',
            });
          }
          if (Number.isFinite(notification.endOffsetMinutes)) {
            const boundaryMs = event.endMs + (notification.endOffsetMinutes * 60000);
            boundaries.push({
              id: this._buildBoundaryId(notification.notificationKey, boundaryMs, 'endOffset', eventSignature),
              calendarName: this.config.name,
              notificationKey: notification.notificationKey,
              dueMs: boundaryMs,
              eventSignature,
              boundaryType: 'endOffset',
            });
          }
        });
      });
    });
    return boundaries.filter((entry) => (
      Number.isFinite(entry.dueMs)
      && entry.dueMs >= (nowMs - EVENT_PAST_WINDOW_MS)
      && entry.dueMs <= (nowMs + EVENT_FUTURE_WINDOW_MS)
    ));
  }

  handleDeadline(deadline, meta = {}) {
    const nowMs = Number.isFinite(meta.nowMs) ? meta.nowMs : this.clock();
    this._pruneBoundaryMap(nowMs);
    if (this._isBoundaryRecentlyFired(deadline.id, nowMs)) {
      this.log.debug('[Calendar:%s] Skipping duplicate boundary fire: %s', this.config.name, deadline.id);
      return;
    }
    this.triggerPulse(
      deadline.notificationKey,
      () => this.publishNotificationState(deadline.notificationKey, true),
      () => this.publishNotificationState(deadline.notificationKey, false),
    );
    this._markBoundaryFired(deadline.id, nowMs);
    const dueIso = new Date(deadline.dueMs).toISOString();
    const latenessMs = Number.isFinite(meta.latenessMs) ? meta.latenessMs : Math.max(0, nowMs - deadline.dueMs);
    this.log.info(
      '[Calendar:%s] Notification fired: %s due=%s latency=%s',
      this.config.name,
      deadline.notificationKey,
      dueIso,
      this._latencyBucket(latenessMs),
    );
  }

  async refreshNow() {
    if (this.stopped) {
      return;
    }
    if (this.refreshing) {
      this.queuedRefresh = true;
      return;
    }

    this.refreshing = true;
    try {
      const nowMs = this.clock();
      const fallbackPollMs = nowMs - (this.config.updateIntervalMinutes * 60000);
      const persistedPollMs = Number(this.getPersistedLastPollMs());
      const hasValidPersistedPollMs = Number.isFinite(persistedPollMs) && persistedPollMs > 0;
      const previousPollMs = hasValidPersistedPollMs
        ? Math.max(persistedPollMs, nowMs - MAX_REPLAY_WINDOW_MS)
        : (this.lastPollMs ?? fallbackPollMs);
      const replaySource = hasValidPersistedPollMs ? 'persisted' : (this.lastPollMs === null ? 'fallback' : 'memory');
      const replayCapped = hasValidPersistedPollMs && persistedPollMs < (nowMs - MAX_REPLAY_WINDOW_MS);
      this.log.debug(
        '[Calendar:%s] Refresh window from=%s to=%s source=%s capped=%s',
        this.config.name,
        new Date(previousPollMs).toISOString(),
        new Date(nowMs).toISOString(),
        replaySource,
        replayCapped,
      );

      const events = await this.provider.listEvents(this.config.url, this.config.requestTimeoutSeconds);
      const filteredEvents = events.filter((event) => (
        event.endMs >= (nowMs - EVENT_PAST_WINDOW_MS)
        && event.startMs <= (nowMs + EVENT_FUTURE_WINDOW_MS)
      ));
      this.log.debug(
        '[Calendar:%s] Event window filter kept %d/%d events',
        this.config.name,
        filteredEvents.length,
        events.length,
      );

      const activeEvents = filteredEvents.filter((event) => isEventActive(event, nowMs));
      const delta = computeEventDelta(this.previousEvents, filteredEvents);
      if (delta.added > 0 || delta.removed > 0 || delta.changed > 0) {
        this.log.info('[Calendar:%s] Event delta: %s', this.config.name, formatCalendarDelta(delta.added, delta.removed, delta.changed));
      }
      this.log.debug('[Calendar:%s] Event delta detail: %j', this.config.name, delta);
      this.previousEvents = filteredEvents;

      const matchedByDef = this.eventDefs.map((def) => {
        const activeMatches = activeEvents.filter((event) => def.regex.test(event.summary));
        const allMatches = filteredEvents.filter((event) => def.regex.test(event.summary));
        return { def, activeMatches, allMatches };
      });

      const watchedActiveCount = matchedByDef.reduce((acc, item) => acc + item.activeMatches.length, 0);
      const calendarIsActive = this.config.triggerOnAnyEvent
        ? activeEvents.length > 0
        : watchedActiveCount > 0;

      if (this.config.triggerOnUpdates && calendarIsActive) {
        this.triggerPulse(
          'calendar-main',
          () => this.publishRootState(true),
          () => this.publishRootState(false),
        );
      } else {
        this.publishRootState(calendarIsActive);
      }

      matchedByDef.forEach(({ def, activeMatches, allMatches }) => {
        const active = activeMatches.length > 0;
        const progress = active ? computeProgress(activeMatches[0], nowMs) : 0.0001;

        if (def.triggerOnUpdates && active) {
          this.triggerPulse(
            def.eventKey,
            () => this.publishEventState(def.eventKey, true, progress),
            () => this.publishEventState(def.eventKey, false, this.getEventState(def.eventKey).progress),
          );
        } else {
          this.publishEventState(def.eventKey, active, progress);
        }
      });

      if (this.deadlineQueue) {
        const boundaries = this._buildBoundariesForMatches(matchedByDef, nowMs);
        const queueStats = this.deadlineQueue.upsertCalendarDeadlines(this.config.name, boundaries);
        if (queueStats.added > 0 || queueStats.removed > 0) {
          this.log.info(
            '[Calendar:%s] Queue rebuild: +%d -%d total=%d',
            this.config.name,
            queueStats.added,
            queueStats.removed,
            queueStats.total,
          );
        }
      }

      this.log.debug(
        '[Calendar:%s] Refresh complete: %d events, %d active, %d watched',
        this.config.name,
        events.length,
        activeEvents.length,
        watchedActiveCount,
      );

      this.lastPollMs = nowMs;
      this.setPersistedLastPollMs(nowMs);
    } finally {
      this.refreshing = false;
      if (this.queuedRefresh) {
        this.queuedRefresh = false;
        await this.refreshNow();
      }
    }
  }

  triggerPulse(key, activate, deactivate) {
    activate();

    const previous = this.pulseTimers.get(key);
    if (previous) {
      this.clearTimeoutFn(previous);
    }

    const timeout = this.setTimeoutFn(() => {
      deactivate();
      this.pulseTimers.delete(key);
    }, PULSE_MS);

    this.pulseTimers.set(key, timeout);
  }

  publishRootState(active) {
    this.mainActive = Boolean(active);
    this.rootSubscribers.forEach((listener) => listener(this.mainActive));
  }

  publishEventState(eventKey, active, progress) {
    const next = {
      active: Boolean(active),
      progress: Number.isFinite(progress) ? progress : 0.0001,
    };
    this.eventStates.set(eventKey, next);
    const listeners = this.eventSubscribers.get(eventKey);
    if (listeners) {
      listeners.forEach((listener) => listener(next));
    }
  }

  publishNotificationState(notificationKey, active) {
    const next = Boolean(active);
    this.notificationStates.set(notificationKey, next);
    const listeners = this.notificationSubscribers.get(notificationKey);
    if (listeners) {
      listeners.forEach((listener) => listener(next));
    }
  }

  getRootState() {
    return this.mainActive;
  }

  getEventState(eventKey) {
    return this.eventStates.get(eventKey) || { active: false, progress: 0.0001 };
  }

  getNotificationState(notificationKey) {
    return Boolean(this.notificationStates.get(notificationKey));
  }

  subscribeRoot(listener) {
    this.rootSubscribers.add(listener);
    listener(this.getRootState());
    this.start();
    return () => {
      this.rootSubscribers.delete(listener);
    };
  }

  subscribeEvent(eventKey, listener) {
    if (!this.eventSubscribers.has(eventKey)) {
      this.eventSubscribers.set(eventKey, new Set());
    }
    const listeners = this.eventSubscribers.get(eventKey);
    listeners.add(listener);
    listener(this.getEventState(eventKey));
    this.start();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.eventSubscribers.delete(eventKey);
      }
    };
  }

  subscribeNotification(notificationKey, listener) {
    if (!this.notificationSubscribers.has(notificationKey)) {
      this.notificationSubscribers.set(notificationKey, new Set());
    }
    const listeners = this.notificationSubscribers.get(notificationKey);
    listeners.add(listener);
    listener(this.getNotificationState(notificationKey));
    this.start();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        this.notificationSubscribers.delete(notificationKey);
      }
    };
  }
}

module.exports = {
  CalendarEngine,
};
