'use strict';

function escapeRegexLiteral(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tryCompileRegex(pattern, flags = '') {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    return { ok: false, error };
  }
}

function compileRegexOrThrow(pattern, flags = '', contextLabel) {
  const result = tryCompileRegex(pattern, flags);
  if (result.ok) {
    return result.regex;
  }
  if (contextLabel) {
    throw new Error(`${contextLabel}: ${result.error.message}`);
  }
  throw result.error;
}

function compileRegexWithFallback(pattern, options = {}) {
  const {
    flags = '',
    fallback = 'exact',
    log,
    label,
    warnMessage,
  } = options;

  const result = tryCompileRegex(pattern, flags);
  if (result.ok) {
    return result.regex;
  }

  if (fallback !== 'exact') {
    throw result.error;
  }

  if (log && typeof log.warn === 'function') {
    if (typeof warnMessage === 'function') {
      warnMessage(log, result.error);
    } else if (label) {
      log.warn('[Regex:%s] Invalid pattern "%s"; using exact match fallback', label, pattern);
    } else {
      log.warn('[Regex] Invalid pattern "%s"; using exact match fallback', pattern);
    }
  }

  return new RegExp(`^${escapeRegexLiteral(pattern)}$`);
}

function testRegexMatch(regex, text, options = {}) {
  const invert = Boolean(options.invert);
  const matched = regex.test(String(text || ''));
  return invert ? !matched : matched;
}

function compileRegexSpec(spec, options = {}) {
  const source = spec && typeof spec === 'object' ? spec : {};
  const mode = source.mode === 'literal' ? 'literal' : 'regex';
  const pattern = String(source.pattern || '');
  const flags = typeof source.flags === 'string' ? source.flags : '';
  const onInvalid = source.onInvalid === 'literal-fallback' ? 'literal-fallback' : 'error';

  if (mode === 'literal') {
    return new RegExp(`^${escapeRegexLiteral(pattern)}$`, flags);
  }

  if (onInvalid === 'literal-fallback') {
    return compileRegexWithFallback(pattern, {
      ...options,
      flags,
      fallback: 'exact',
    });
  }

  return compileRegexOrThrow(pattern, flags, options.contextLabel);
}

module.exports = {
  escapeRegexLiteral,
  tryCompileRegex,
  compileRegexOrThrow,
  compileRegexWithFallback,
  testRegexMatch,
  compileRegexSpec,
};
