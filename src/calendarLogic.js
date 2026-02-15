'use strict';

function clampProgress(value) {
  const rounded = Math.round(value);
  return Math.max(0.0001, Math.min(100, rounded));
}

function isEventActive(event, nowMs) {
  return event.startMs <= nowMs && nowMs < event.endMs;
}

function computeProgress(event, nowMs) {
  const duration = event.endMs - event.startMs;
  if (duration <= 0) {
    return 0.0001;
  }

  const progress = ((nowMs - event.startMs) / duration) * 100;
  return clampProgress(progress);
}

function boundaryInsideWindow(boundaryMs, fromMs, toMs) {
  return boundaryMs > fromMs && boundaryMs <= toMs;
}

function shouldFireNotification(event, notification, fromMs, toMs) {
  if (Number.isFinite(notification.startOffsetMinutes)) {
    const boundary = event.startMs + (notification.startOffsetMinutes * 60000);
    if (boundaryInsideWindow(boundary, fromMs, toMs)) {
      return true;
    }
  }

  if (Number.isFinite(notification.endOffsetMinutes)) {
    const boundary = event.endMs + (notification.endOffsetMinutes * 60000);
    if (boundaryInsideWindow(boundary, fromMs, toMs)) {
      return true;
    }
  }

  return false;
}

module.exports = {
  clampProgress,
  isEventActive,
  computeProgress,
  shouldFireNotification,
};
