'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OperationCoordinator } = require('../src/execution');


test('OperationCoordinator serializes operations for same key', async () => {
  const coordinator = new OperationCoordinator();
  const order = [];

  const first = coordinator.run('a', async () => {
    order.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push('first-end');
  });

  const second = coordinator.run('a', async () => {
    order.push('second-start');
    order.push('second-end');
  });

  await Promise.all([first, second]);

  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
});


test('OperationCoordinator allows different keys to run in parallel', async () => {
  const coordinator = new OperationCoordinator();
  let secondStartedBeforeFirstEnded = false;
  let firstEnded = false;

  const first = coordinator.run('a', async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    firstEnded = true;
  });

  const second = coordinator.run('b', async () => {
    secondStartedBeforeFirstEnded = !firstEnded;
  });

  await Promise.all([first, second]);

  assert.equal(secondStartedBeforeFirstEnded, true);
});

test('OperationCoordinator times out hung operation and unblocks next one', async () => {
  const coordinator = new OperationCoordinator(20);
  let secondRan = false;

  await assert.rejects(
    coordinator.run('same', async () => new Promise(() => {})),
    /timed out/i,
  );

  await coordinator.run('same', async () => {
    secondRan = true;
  });

  assert.equal(secondRan, true);
});
