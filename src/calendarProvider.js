'use strict';

async function defaultFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Calendar request failed: HTTP ${response.status}`);
  }
  return response.text();
}

function tryLoadNodeIcal() {
  try {
    // Optional dependency for robust ICS parsing.
    return require('node-ical');
  } catch (error) {
    return null;
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

function fallbackParseEvents(text) {
  // Minimal line-based fallback parser for DTSTART/DTEND/SUMMARY.
  const lines = text.split(/\r?\n/);
  const events = [];
  let current = null;

  const parseDateValue = (value) => {
    if (/^\d{8}T\d{6}Z$/.test(value)) {
      const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
      return new Date(iso).getTime();
    }
    if (/^\d{8}$/.test(value)) {
      const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`;
      return new Date(iso).getTime();
    }
    return new Date(value).getTime();
  };

  lines.forEach((line) => {
    if (line === 'BEGIN:VEVENT') {
      current = { summary: '', startMs: null, endMs: null };
      return;
    }

    if (line === 'END:VEVENT') {
      if (current && Number.isFinite(current.startMs) && Number.isFinite(current.endMs)) {
        events.push(current);
      }
      current = null;
      return;
    }

    if (!current) {
      return;
    }

    if (line.startsWith('SUMMARY:')) {
      current.summary = line.slice(8).trim();
    } else if (line.startsWith('DTSTART')) {
      const value = line.split(':').pop();
      current.startMs = parseDateValue(value);
    } else if (line.startsWith('DTEND')) {
      const value = line.split(':').pop();
      current.endMs = parseDateValue(value);
    }
  });

  return events;
}

class CalendarProvider {
  constructor(log, customFetch = defaultFetch) {
    this.log = log;
    this.fetch = customFetch;
    this.nodeIcal = tryLoadNodeIcal();

    if (!this.nodeIcal) {
      this.log.debug('[CalendarProvider] Optional dependency node-ical is not installed; using fallback parser');
    }
  }

  async listEvents(url) {
    const text = await this.fetch(url);

    if (this.nodeIcal) {
      const parsed = this.nodeIcal.parseICS(text);
      return normalizeParsedEvents(parsed);
    }

    return fallbackParseEvents(text);
  }
}

module.exports = {
  CalendarProvider,
};
