'use strict';

const { exec } = require('node:child_process');

function runShellCommand(command, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    exec(command, {
      shell: true,
      timeout: Math.max(1, timeoutSeconds) * 1000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runWebhookRequest(action, timeoutSeconds) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Number(timeoutSeconds) || 1) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(action.input, {
      method: action.method || 'GET',
      headers: action.headers,
      body: action.body,
      signal: controller.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      const error = new Error(`Webhook request failed: HTTP ${response.status}`);
      error.statusCode = response.status;
      error.body = body;
      throw error;
    }
    return {
      transport: 'webhook',
      statusCode: response.status,
      body,
    };
  } catch (error) {
    if (error && error.name === 'AbortError') {
      const timeoutError = new Error(`Webhook request timed out after ${Math.max(1, Number(timeoutSeconds) || 1)}s`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function runAction(action, timeoutSeconds) {
  if (!action || action.transport === 'command') {
    const result = await runShellCommand(action?.input ?? action, timeoutSeconds);
    return {
      transport: 'command',
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  return runWebhookRequest(action, timeoutSeconds);
}

module.exports = {
  runShellCommand,
  runWebhookRequest,
  runAction,
};
