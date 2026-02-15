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

module.exports = {
  runShellCommand,
};
