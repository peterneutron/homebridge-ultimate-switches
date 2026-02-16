'use strict';

const nodeIcal = require('node-ical');

function normalizeCalendarUrl(url) {
  if (typeof url !== 'string') {
    return url;
  }

  if (url.toLowerCase().startsWith('webcal://')) {
    return `https://${url.slice('webcal://'.length)}`;
  }

  return url;
}

async function defaultFetch(url) {
  const normalizedUrl = normalizeCalendarUrl(url);
  const response = await fetch(normalizedUrl);
  if (!response.ok) {
    throw new Error(`Calendar request failed: HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchWithTimeout(fetchFn, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeParsedEvents(parsed) {
  const events = [];

  Object.values(parsed).forEach((entry) => {
    if (!entry || entry.type !== 'VEVENT' || !entry.start || !entry.end) {
      return;
    }

    const startMs = new Date(entry.start).getTime();
    const endMs = new Date(entry.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return;
    }

    events.push({
      summary: typeof entry.summary === 'string' ? entry.summary : '',
      startMs,
      endMs,
    });
  });

  return events;
}

class CalendarProvider {
  constructor(log, customFetch = defaultFetch, defaultTimeoutSeconds = 15) {
    this.log = log;
    this.fetch = customFetch;
    this.nodeIcal = nodeIcal;
    this.defaultTimeoutSeconds = defaultTimeoutSeconds;
    this.responseCache = new Map();
  }

  async listEvents(url, requestTimeoutSeconds) {
    const normalizedUrl = normalizeCalendarUrl(url);
    const timeoutSeconds = Number.isFinite(Number(requestTimeoutSeconds))
      ? Math.max(1, Number(requestTimeoutSeconds))
      : this.defaultTimeoutSeconds;

    let text;
    if (this.fetch === defaultFetch) {
      const cacheEntry = this.responseCache.get(normalizedUrl) || {};
      const headers = {};
      if (cacheEntry.etag) {
        headers['If-None-Match'] = cacheEntry.etag;
      }
      if (cacheEntry.lastModified) {
        headers['If-Modified-Since'] = cacheEntry.lastModified;
      }

      const response = await fetchWithTimeout(
        async (targetUrl, options) => fetch(targetUrl, { ...options, headers }),
        normalizedUrl,
        timeoutSeconds * 1000,
      );

      if (response.status === 304) {
        this.log.debug('[CalendarProvider] Not modified: %s', normalizedUrl);
        return Array.isArray(cacheEntry.events) ? cacheEntry.events : [];
      }

      if (!response.ok) {
        throw new Error(`Calendar request failed: HTTP ${response.status}`);
      }

      text = await response.text();
      try {
        const parsed = this.nodeIcal.parseICS(text);
        const events = normalizeParsedEvents(parsed);
        this.responseCache.set(normalizedUrl, {
          etag: response.headers.get('etag') || undefined,
          lastModified: response.headers.get('last-modified') || undefined,
          events,
        });
        return events;
      } catch (error) {
        throw new Error(`Calendar parse failed for ${normalizedUrl}: ${error.message}`);
      }
    }

    text = await this.fetch(normalizedUrl);
    try {
      const parsed = this.nodeIcal.parseICS(text);
      return normalizeParsedEvents(parsed);
    } catch (error) {
      throw new Error(`Calendar parse failed for ${normalizedUrl}: ${error.message}`);
    }
  }
}

module.exports = {
  CalendarProvider,
  normalizeCalendarUrl,
};
