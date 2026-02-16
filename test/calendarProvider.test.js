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
