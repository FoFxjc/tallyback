/**
 * A separate-process ledger writer, used by `test/concurrency.test.ts` to prove that the
 * single-writer lock is a real cross-process lock and not an in-process convention.
 *
 * Usage: `tsx test/helpers/concurrent-writer.ts <projectRoot> <label> <appendCount>`.
 *
 * Each append opens a Store, retries an ordinary revision conflict against a freshly read
 * revision, and reports what it committed on stdout as one JSON line.
 */

import { Store } from '../../src/ledger/index.js';

const [, , projectRoot, label, countRaw] = process.argv;
if (!projectRoot || !label) {
  process.stderr.write('usage: concurrent-writer <projectRoot> <label> <appendCount>\n');
  process.exit(2);
}
const count = Number.parseInt(countRaw ?? '1', 10);

const revisions: number[] = [];
let conflicts = 0;

const store = await Store.open(projectRoot);
const topicId = store.listTopics()[0]?.topic_id;
if (!topicId) {
  process.stderr.write('the ledger has no topic to attach tasks to\n');
  process.exit(2);
}

for (let i = 0; i < count; i++) {
  for (let attempt = 0; ; attempt++) {
    const outcome = await store.createTask({ topic_id: topicId, title: `${label}-${i}` });
    if (outcome.ok) {
      revisions.push(outcome.revision);
      break;
    }
    if (outcome.code !== 'mutation.revision_conflict' || attempt >= 50) {
      process.stdout.write(JSON.stringify({ label, error: outcome.code }) + '\n');
      process.exit(1);
    }
    conflicts += 1;
    await store.reload();
  }
}

process.stdout.write(JSON.stringify({ label, revisions, conflicts }) + '\n');
