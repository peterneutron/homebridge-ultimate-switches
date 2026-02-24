'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { runWebhookRequest } = require('../src/commandExecutor');

test('runWebhookRequest performs GET and returns body/status', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'http://127.0.0.1/status');
    assert.equal(options.method, 'GET');
    return {
      ok: true,
      status: 200,
      async text() { return 'READY=1'; },
    };
  };

  try {
    const result = await runWebhookRequest({ input: 'http://127.0.0.1/status', method: 'GET' }, 2);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body, 'READY=1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runWebhookRequest performs POST with headers/body', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Test'], '1');
    assert.equal(options.body, '{"on":true}');
    return {
      ok: true,
      status: 204,
      async text() { return ''; },
    };
  };

  try {
    const result = await runWebhookRequest({
      input: 'http://127.0.0.1/on',
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: '{"on":true}',
    }, 2);
    assert.equal(result.statusCode, 204);
    assert.equal(result.body, '');
  } finally {
    global.fetch = originalFetch;
  }
});

test('runWebhookRequest converts AbortError into timeout error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  try {
    await assert.rejects(
      runWebhookRequest({ input: 'http://127.0.0.1/status', method: 'GET' }, 1),
      /timed out/i,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('runWebhookRequest throws on non-2xx and includes status/body', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 500,
    async text() { return 'ERR'; },
  });

  try {
    await assert.rejects(async () => {
      try {
        await runWebhookRequest({ input: 'http://127.0.0.1/status', method: 'GET' }, 2);
      } catch (error) {
        assert.equal(error.statusCode, 500);
        assert.equal(error.body, 'ERR');
        throw error;
      }
    }, /HTTP 500/);
  } finally {
    global.fetch = originalFetch;
  }
});
