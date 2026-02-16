'use strict';

const DEFAULT_CATCHUP_GRACE_MS = 10 * 60 * 1000;
const DEFAULT_FIRED_TTL_MS = 24 * 60 * 60 * 1000;

class CalendarDeadlineQueue {
  constructor(log, clock = () => Date.now(), timers = {}, options = {}) {
    this.log = log;
    this.clock = clock;
    this.setTimeoutFn = timers.setTimeout || setTimeout;
    this.clearTimeoutFn = timers.clearTimeout || clearTimeout;
    this.catchupGraceMs = Number.isFinite(options.catchupGraceMs)
      ? Math.max(0, Number(options.catchupGraceMs))
      : DEFAULT_CATCHUP_GRACE_MS;
    this.firedTtlMs = Number.isFinite(options.firedTtlMs)
      ? Math.max(1, Number(options.firedTtlMs))
      : DEFAULT_FIRED_TTL_MS;

    this.stopped = false;
    this.activeTimer = null;
    this.heap = [];
    this.deadlinesById = new Map();
    this.deadlineIdsByCalendar = new Map();
    this.callbacks = new Map();
  }

  registerCalendar(calendarName, onDue) {
    if (typeof onDue !== 'function') {
      throw new Error(`Calendar callback is required for ${calendarName}`);
    }
    this.callbacks.set(calendarName, onDue);
  }

  removeCalendar(calendarName) {
    this.callbacks.delete(calendarName);
    const ids = this.deadlineIdsByCalendar.get(calendarName);
    if (ids) {
      ids.forEach((id) => this.deadlinesById.delete(id));
      this.deadlineIdsByCalendar.delete(calendarName);
      this._rearm();
    }
  }

  stop() {
    this.stopped = true;
    if (this.activeTimer) {
      this.clearTimeoutFn(this.activeTimer);
      this.activeTimer = null;
    }
    this.heap = [];
    this.deadlinesById.clear();
    this.deadlineIdsByCalendar.clear();
    this.callbacks.clear();
  }

  upsertCalendarDeadlines(calendarName, rawDeadlines) {
    if (this.stopped) {
      return { added: 0, removed: 0, total: 0 };
    }

    const previous = this.deadlineIdsByCalendar.get(calendarName) || new Set();
    let removed = 0;
    previous.forEach((id) => {
      if (this.deadlinesById.delete(id)) {
        removed += 1;
      }
    });

    const next = new Set();
    let added = 0;
    const deadlines = Array.isArray(rawDeadlines) ? rawDeadlines : [];
    deadlines.forEach((entry) => {
      if (!entry || typeof entry.id !== 'string') {
        return;
      }
      const dueMs = Number(entry.dueMs);
      if (!Number.isFinite(dueMs)) {
        return;
      }
      const normalized = {
        id: entry.id,
        calendarName,
        notificationKey: entry.notificationKey,
        dueMs,
        eventSignature: entry.eventSignature,
        boundaryType: entry.boundaryType,
      };
      this.deadlinesById.set(normalized.id, normalized);
      next.add(normalized.id);
      this._heapPush(normalized);
      added += 1;
    });

    this.deadlineIdsByCalendar.set(calendarName, next);
    this._rearm();
    return {
      added,
      removed,
      total: next.size,
    };
  }

  _heapPush(item) {
    this.heap.push(item);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].dueMs <= this.heap[index].dueMs) {
        break;
      }
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  _heapPop() {
    if (!this.heap.length) {
      return null;
    }
    const first = this.heap[0];
    const last = this.heap.pop();
    if (this.heap.length && last) {
      this.heap[0] = last;
      this._heapifyDown(0);
    }
    return first;
  }

  _heapifyDown(index) {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;
      if (left < this.heap.length && this.heap[left].dueMs < this.heap[smallest].dueMs) {
        smallest = left;
      }
      if (right < this.heap.length && this.heap[right].dueMs < this.heap[smallest].dueMs) {
        smallest = right;
      }
      if (smallest === current) {
        break;
      }
      [this.heap[current], this.heap[smallest]] = [this.heap[smallest], this.heap[current]];
      current = smallest;
    }
  }

  _isCurrent(entry) {
    const active = this.deadlinesById.get(entry.id);
    return Boolean(
      active
      && active.dueMs === entry.dueMs
      && active.calendarName === entry.calendarName,
    );
  }

  _nextValid() {
    while (this.heap.length) {
      const top = this.heap[0];
      if (this._isCurrent(top)) {
        return top;
      }
      this._heapPop();
    }
    return null;
  }

  _rearm() {
    if (this.stopped) {
      return;
    }
    if (this.activeTimer) {
      this.clearTimeoutFn(this.activeTimer);
      this.activeTimer = null;
    }
    const next = this._nextValid();
    if (!next) {
      return;
    }
    const now = this.clock();
    const delay = Math.max(0, next.dueMs - now);
    this.log.debug('[CalendarQueue] Next deadline in %dms (%s)', delay, next.id);
    this.activeTimer = this.setTimeoutFn(() => {
      this.activeTimer = null;
      this._drainDue();
      this._rearm();
    }, delay);
  }

  _drainDue() {
    const now = this.clock();
    let fired = 0;
    let skippedStale = 0;
    while (true) {
      const next = this._nextValid();
      if (!next || next.dueMs > now) {
        break;
      }
      this._heapPop();
      if (!this._isCurrent(next)) {
        continue;
      }
      const latenessMs = now - next.dueMs;
      if (latenessMs > this.catchupGraceMs) {
        skippedStale += 1;
        this.log.debug('[CalendarQueue] Skipping stale deadline %s lateness=%dms', next.id, latenessMs);
        continue;
      }
      const callback = this.callbacks.get(next.calendarName);
      if (callback) {
        callback(next, { nowMs: now, latenessMs });
        fired += 1;
      }
    }
    if (fired > 0 || skippedStale > 0) {
      this.log.debug('[CalendarQueue] Drain complete fired=%d skippedStale=%d', fired, skippedStale);
    }
  }
}

module.exports = {
  CalendarDeadlineQueue,
};
