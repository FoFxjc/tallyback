import { describe, expect, it } from 'vitest';

import {
  AUTHENTICITY_MAP,
  mapAuthenticity,
  mapPresence,
  migrateLegacySnapshot,
  PRESENCE_MAP,
  UNKNOWN_ACTOR,
} from '../src/check/migration.js';

const LEGACY = {
  active_topic: 'work',
  current_task: 'T1',
  topics: [
    {
      name: 'work',
      goal: 'ship it',
      status: 'active',
      tasks: [
        {
          id: 'T1',
          title: 'Implement validation',
          status: 'done',
          evidence: ['committed the validation logic'],
          attempts: [{ description: 'first pass', outcome: 'passed' }],
          next_action: 'review the diff',
          blockers: [{ description: 'blocked on review', task_id: 'T1' }],
          decisions: [{ summary: 'chose approach A', rationale: 'simpler' }],
        },
      ],
    },
  ],
};

describe('legacy Store migration', () => {
  it('migrates topic/task and preserves the legacy alias', () => {
    const { records } = migrateLegacySnapshot(LEGACY);
    expect(records.projects).toHaveLength(1);
    expect(records.topics).toHaveLength(1);
    expect(records.tasks).toHaveLength(1);

    const project = records.projects[0]!;
    const topic = records.topics[0]!;
    const task = records.tasks[0]!;

    expect(project.project_id).toMatch(/^prj_/);
    expect(topic.project_id).toBe(project.project_id);
    expect(topic.name).toBe('work');
    expect(topic.goal).toBe('ship it');
    expect(topic.created_by).toEqual(UNKNOWN_ACTOR);
    expect(topic.created_at).toBeNull();

    expect(task.topic_id).toBe(topic.topic_id);
    expect(task.title).toBe('Implement validation');
    expect(task.alias).toBe('T1');
  });

  it('migrates evidence strings and attempts[] to observation records (never Attempt records)', () => {
    const { records } = migrateLegacySnapshot(LEGACY);
    expect('attempts' in records).toBe(false);
    expect('declarations' in records).toBe(false);
    expect('claims' in records).toBe(false);

    const notes = records.evidence.map((e) => e.note);
    expect(notes).toContain('Migrated from T1 (legacy-task-evidence).');
    expect(notes).toContain('Migrated from T1 (legacy-attempt).');
    expect(notes).toContain('Migrated from T1 (legacy-status).');

    for (const evidence of records.evidence) {
      expect(evidence.kind).toBe('observation');
      expect(evidence.submitted_by).toEqual(UNKNOWN_ACTOR);
      expect(evidence.submitted_at).toBeNull();
      const payload = evidence.payload as { task_id?: string; text?: string };
      // The observation payload is closed (text/observer/observed_at only); a
      // migrated evidence string is not re-linked to a task id (observations carry
      // no task reference field — the legacy alias is preserved in `note`).
      expect(payload.task_id).toBeUndefined();
      expect(typeof payload.text).toBe('string');
    }

    const attemptObservation = records.evidence.find((e) => e.note?.includes('legacy-attempt'))!;
    expect((attemptObservation.payload as { text?: string }).text).toBe(
      'first pass — outcome: passed',
    );
  });

  it('migrates status "done" to an observation, never a Claim', () => {
    const { records } = migrateLegacySnapshot(LEGACY);
    const doneObservation = records.evidence.find((e) => e.note?.includes('legacy-status'))!;
    expect((doneObservation.payload as { text?: string }).text).toBe('legacy status: done');
    expect('claims' in records).toBe(false);
  });

  it('migrates blockers and decisions with generated identity and unknown provenance', () => {
    const { records } = migrateLegacySnapshot(LEGACY);
    const taskId = records.tasks[0]!.task_id;

    expect(records.blockers).toHaveLength(1);
    expect(records.blockers[0]!.task_id).toBe(taskId);
    expect(records.blockers[0]!.description).toBe('blocked on review');
    expect(records.blockers[0]!.raised_by).toEqual(UNKNOWN_ACTOR);
    expect(records.blockers[0]!.raised_at).toBeNull();

    // next_action + one execution_choice decision
    expect(records.decisions).toHaveLength(2);
    const nextAction = records.decisions.find((d) => d.role === 'next_action')!;
    expect(nextAction.choice).toBe('review the diff');
    expect(nextAction.subject).toEqual({ kind: 'task', id: taskId });
    const exec = records.decisions.find((d) => d.role === 'execution_choice')!;
    expect(exec.choice).toBe('chose approach A');
    expect(exec.rationale).toBe('simpler');
  });

  it('writes an id mapping whose canonical ids match the generated records', () => {
    const { records, report } = migrateLegacySnapshot(LEGACY);
    const taskMapping = report.mapping.find((m) => m.legacy_id === 'T1')!;
    expect(taskMapping.canonical_id).toBe(records.tasks[0]!.task_id);
    expect(taskMapping.record_type).toBe('task');
    expect(report.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports derived fields as non-migrated diagnostics', () => {
    const { report } = migrateLegacySnapshot(LEGACY);
    const text = report.diagnostics.join('\n');
    expect(text).toContain('active_topic');
    expect(text).toContain('current_task');
    expect(text).toContain('derived projection');
    expect(text).toContain('scope is ambiguous');
  });
});

describe('done-or-not status mapping', () => {
  it('maps authenticity statuses to canonical treatment', () => {
    expect(mapAuthenticity('Not audited').emits_verdict).toBe(false);
    expect(mapAuthenticity('Preliminary').finality).toBe('preliminary');
    expect(mapAuthenticity('Preliminary').conclusion).toBeUndefined();
    expect(mapAuthenticity('Real').conclusion).toBe('supported');
    expect(mapAuthenticity('Fake').conclusion).toBe('contradicted');
    expect(mapAuthenticity('Non-operational').finding).toBe('non_operational');
    expect(mapAuthenticity('Drifted').finding).toBe('drift');
    expect(Object.keys(AUTHENTICITY_MAP)).toHaveLength(8);
  });

  it('maps presence statuses without synthesizing verdicts', () => {
    expect(mapPresence('Claimed').treatment).toBe('claim');
    expect(mapPresence('Observed').treatment).toBe('evidence');
    expect(mapPresence('Inferred').treatment).toBe('judgment');
    expect(mapPresence('Confirmed').treatment).toBe('supported');
    expect(Object.keys(PRESENCE_MAP)).toHaveLength(4);
  });
});
