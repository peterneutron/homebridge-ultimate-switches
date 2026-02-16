'use strict';

const { CalendarProvider } = require('./calendarProvider');
const { computeProgress, isEventActive, shouldFireNotification } = require('./calendarLogic');
const { buildCalendarEventKey, buildCalendarNotificationKey } = require('./calendarKeys');
const { formatCalendarDelta } = require('./logger');

const PULSE_MS = 10000;
const MAX_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000;

function safeRegex(pattern, log, label) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    log.warn('[Calendar:%s] Invalid regex pattern "%s"; using exact match fallback', label, pattern);
    const escaped = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`);
  }
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
  constructor(log, calendarConfig, provider = null, clock = () => Date.now(), timers = {}, persistence = {}) {
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
        regex: safeRegex(event.name, this.log, this.config.name),
        eventKey,
        notifications,
      };
    });
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
      const activeEvents = events.filter((event) => isEventActive(event, nowMs));
      const delta = computeEventDelta(this.previousEvents, events);
      if (delta.added > 0 || delta.removed > 0 || delta.changed > 0) {
        this.log.info('[Calendar:%s] Event delta: %s', this.config.name, formatCalendarDelta(delta.added, delta.removed, delta.changed));
      }
      this.log.debug('[Calendar:%s] Event delta detail: %j', this.config.name, delta);
      this.previousEvents = events;

      const matchedByDef = this.eventDefs.map((def) => {
        const activeMatches = activeEvents.filter((event) => def.regex.test(event.summary));
        const allMatches = events.filter((event) => def.regex.test(event.summary));
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

      let firedNotifications = 0;
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

        def.notifications.forEach((notification) => {
          const shouldFire = allMatches.some((event) => shouldFireNotification(event, notification, previousPollMs, nowMs));
          if (shouldFire) {
            firedNotifications += 1;
            this.log.debug('[Calendar:%s] Notification trigger matched: %s', this.config.name, notification.notificationKey);
            this.triggerPulse(
              notification.notificationKey,
              () => this.publishNotificationState(notification.notificationKey, true),
              () => this.publishNotificationState(notification.notificationKey, false),
            );
          }
        });
      });
      if (firedNotifications > 0) {
        this.log.info('[Calendar:%s] Notifications fired: %d', this.config.name, firedNotifications);
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
