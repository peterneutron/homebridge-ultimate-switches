'use strict';

function safeEventName(eventRegex) {
  const source = String(eventRegex || '');
  const extracted = source.replace(/\W/gi, ' ').trim().replace(/\s+/g, ' ');
  return extracted || source;
}

function buildCalendarRootKey(calendarName) {
  return `calendarRoot:${calendarName}`;
}

function buildCalendarEventKey(calendarName, eventRegex) {
  return `calendarEvent:${calendarName}:${eventRegex}`;
}

function buildCalendarNotificationKey(calendarName, eventRegex, notificationName) {
  return `calendarNotification:${calendarName}:${eventRegex}:${notificationName}`;
}

function buildCalendarEventDisplayName(calendarName, eventRegex) {
  return `${calendarName} ${safeEventName(eventRegex)}`.trim();
}

function buildCalendarNotificationDisplayName(calendarName, eventRegex, notificationName) {
  return `${calendarName} ${safeEventName(eventRegex)} ${notificationName}`.trim();
}

module.exports = {
  safeEventName,
  buildCalendarRootKey,
  buildCalendarEventKey,
  buildCalendarNotificationKey,
  buildCalendarEventDisplayName,
  buildCalendarNotificationDisplayName,
};
