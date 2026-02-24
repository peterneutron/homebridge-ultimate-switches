'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  escapeRegexLiteral,
  tryCompileRegex,
  compileRegexOrThrow,
  compileRegexWithFallback,
  testRegexMatch,
} = require('../src/regexUtils');

test('escapeRegexLiteral escapes regex metacharacters', () => {
  assert.equal(escapeRegexLiteral('a+b(c)?^$'), 'a\\+b\\(c\\)\\?\\^\\$');
});

test('tryCompileRegex returns success and failure result shapes', () => {
  const ok = tryCompileRegex('^abc$');
  assert.equal(ok.ok, true);
  assert.equal(ok.regex.test('abc'), true);

  const bad = tryCompileRegex('(');
  assert.equal(bad.ok, false);
  assert.equal(bad.error instanceof Error, true);
});

test('compileRegexOrThrow throws on invalid pattern', () => {
  assert.throws(() => compileRegexOrThrow('('), Error);
});

test('compileRegexWithFallback exact returns escaped exact matcher', () => {
  const regex = compileRegexWithFallback('(', { fallback: 'exact' });
  assert.equal(regex.test('('), true);
  assert.equal(regex.test('x('), false);
});

test('testRegexMatch supports inverted matching', () => {
  const regex = /READY=1/;
  assert.equal(testRegexMatch(regex, 'READY=1'), true);
  assert.equal(testRegexMatch(regex, 'READY=0'), false);
  assert.equal(testRegexMatch(regex, 'READY=0', { invert: true }), true);
});
