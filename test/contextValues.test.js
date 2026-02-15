'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeContextValues, isoWeekOfYear } = require('../src/contextValues');


test('isoWeekOfYear computes ISO week for new year boundary', () => {
  const week = isoWeekOfYear(new Date('2026-01-01T12:00:00Z'));
  assert.equal(week, 1);
});


test('computeContextValues maps northern summer correctly', () => {
  const values = computeContextValues(new Date('2026-07-15T12:00:00Z'), 52.52);

  assert.equal(values.monthOfYear, 7);
  assert.equal(values.season, 2);
  assert.equal(values.seasonName, 'Summer');
});


test('computeContextValues maps southern hemisphere seasons inverted', () => {
  const values = computeContextValues(new Date('2026-07-15T12:00:00Z'), -33.86);

  assert.equal(values.season, 4);
  assert.equal(values.seasonName, 'Winter');
});


test('computeContextValues maps nighttime bucket', () => {
  const values = computeContextValues(new Date('2026-02-15T02:30:00'), 52.52);
  assert.equal(values.timeOfDay, 6);
  assert.equal(values.timeOfDayName, 'Night');
});
