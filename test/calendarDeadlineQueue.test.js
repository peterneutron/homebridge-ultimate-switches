'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarDeadlineQueue } = require('../src/calendarDeadlineQueue');

function createFakeScheduler() {
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeout(fn, _delay) {
      const id = nextId++;
      tasks.set(id, fn);
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    runAll() {
      const ids = Array.from(tasks.keys());
      ids.forEach((id) => {
        const fn = tasks.get(id);
        if (fn) {
          tasks.delete(id);
          fn();
        }
      });
    },
    size() {
      return tasks.size;
    },
  };
}

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

test('queue fires deadlines in due-time order', () => {
  const scheduler = createFakeScheduler();
  let now = 1000;
  const fired = [];
  const queue = new CalendarDeadlineQueue(logger(), () => now, scheduler);

  queue.registerCalendar('Cal', (deadline) => fired.push(deadline.id));
  queue.upsertCalendarDeadlines('Cal', [
    { id: 'b', calendarName: 'Cal', notificationKey: 'n', dueMs: 1200, eventSignature: 'e', boundaryType: 'startOffset' },
    { id: 'a', calendarName: 'Cal', notificationKey: 'n', dueMs: 1100, eventSignature: 'e', boundaryType: 'startOffset' },
  ]);

  now = 1100;
  scheduler.runAll();
  now = 1200;
  scheduler.runAll();

  assert.deepEqual(fired, ['a', 'b']);
});

test('queue upsert replaces previous calendar boundaries', () => {
  const scheduler = createFakeScheduler();
  let now = 1000;
  const fired = [];
  const queue = new CalendarDeadlineQueue(logger(), () => now, scheduler);
  queue.registerCalendar('Cal', (deadline) => fired.push(deadline.id));

  queue.upsertCalendarDeadlines('Cal', [
    { id: 'old', calendarName: 'Cal', notificationKey: 'n', dueMs: 1100, eventSignature: 'e', boundaryType: 'startOffset' },
  ]);
  queue.upsertCalendarDeadlines('Cal', [
    { id: 'new', calendarName: 'Cal', notificationKey: 'n', dueMs: 1100, eventSignature: 'e', boundaryType: 'startOffset' },
  ]);

  now = 1200;
  scheduler.runAll();

  assert.deepEqual(fired, ['new']);
});

test('queue skips stale deadlines beyond catch-up grace', () => {
  const scheduler = createFakeScheduler();
  const now = 1000 + (11 * 60 * 1000);
  const fired = [];
  const queue = new CalendarDeadlineQueue(logger(), () => now, scheduler);
  queue.registerCalendar('Cal', (deadline) => fired.push(deadline.id));

  queue.upsertCalendarDeadlines('Cal', [
    { id: 'stale', calendarName: 'Cal', notificationKey: 'n', dueMs: 1000, eventSignature: 'e', boundaryType: 'startOffset' },
  ]);

  scheduler.runAll();
  assert.deepEqual(fired, []);
});
