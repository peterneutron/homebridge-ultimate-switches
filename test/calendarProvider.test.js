'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { CalendarProvider, normalizeCalendarUrl } = require('../src/calendarProvider');


test('normalizeCalendarUrl converts webcal to https', () => {
  const url = 'webcal://example.com/path.ics';
  assert.equal(normalizeCalendarUrl(url), 'https://example.com/path.ics');
});


test('listEvents passes normalized URL to fetch and parses ICS via node-ical', async () => {
  const calls = [];
  const provider = new CalendarProvider(
    { debug() {} },
    async (url) => {
      calls.push(url);
      return [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'SUMMARY:Test Event',
        'DTSTART:20260215T120000Z',
        'DTEND:20260215T130000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\n');
    },
  );

  const events = await provider.listEvents('webcal://example.com/test.ics');

  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://example.com/test.ics');
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, 'Test Event');
});

test('listEvents surfaces parser failures with calendar URL context', async () => {
  const provider = new CalendarProvider(
    { debug() {} },
    async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR\n',
  );
  provider.nodeIcal = {
    parseICS() {
      throw new Error('boom');
    },
  };

  await assert.rejects(
    provider.listEvents('webcal://example.com/test.ics'),
    /Calendar parse failed for https:\/\/example.com\/test\.ics: boom/,
  );
});

test('listEvents uses conditional requests and reuses cached events on 304', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  try {
    global.fetch = async (_url, options = {}) => {
      calls.push(options.headers || {});
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          headers: {
            get(name) {
              if (String(name).toLowerCase() === 'etag') {
                return '"abc"';
              }
              if (String(name).toLowerCase() === 'last-modified') {
                return 'Mon, 01 Jan 2024 00:00:00 GMT';
              }
              return null;
            },
          },
          async text() {
            return [
              'BEGIN:VCALENDAR',
              'BEGIN:VEVENT',
              'SUMMARY:Cached Event',
              'DTSTART:20260215T120000Z',
              'DTEND:20260215T130000Z',
              'END:VEVENT',
              'END:VCALENDAR',
            ].join('\n');
          },
        };
      }
      return {
        ok: false,
        status: 304,
        headers: { get() { return null; } },
        async text() { return ''; },
      };
    };

    const provider = new CalendarProvider({ debug() {} });
    const first = await provider.listEvents('https://example.com/test.ics', 5);
    const second = await provider.listEvents('https://example.com/test.ics', 5);

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(second[0].summary, 'Cached Event');
    assert.equal(calls.length, 2);
    assert.equal(calls[1]['If-None-Match'], '"abc"');
    assert.equal(calls[1]['If-Modified-Since'], 'Mon, 01 Jan 2024 00:00:00 GMT');
  } finally {
    global.fetch = originalFetch;
  }
});
