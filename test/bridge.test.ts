import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HANDSHAKE_REQUIREMENT, LOOP_PHASES, READ_ONLY_REPORTS } from '../src/bridge/index.js';
import { FEATURE_INTERFACES, handshake } from '../src/version.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI_SOURCE = readFileSync(join(REPO_ROOT, 'src/cli.ts'), 'utf8');

/**
 * The real, complete `tallyback` command surface, verified by reading `src/cli.ts`'s
 * `if (command === '...')` chain and its `switch (command)` dispatch by hand. This is the
 * list `default:`'s error message in `dispatch()` also enumerates.
 */
const REAL_CLI_COMMANDS = [
  'handshake',
  'version',
  'init',
  'migrate',
  'validate',
  'reconcile',
  'show',
  'list',
  'bindings',
  'land',
  'view',
  'watch',
  'topic',
  'task',
  'workspace',
  'bind',
  'declare',
  'dispatch',
  'end',
  'claim',
  'evidence',
  'begin-check',
  'record-check',
  'verdict',
  'block',
  'resolve',
  'settle',
  'decision',
];

describe('bridge: real CLI commands actually exist', () => {
  it.each(REAL_CLI_COMMANDS)('src/cli.ts dispatches "%s"', (command) => {
    const dispatchedByIf = CLI_SOURCE.includes(`command === '${command}'`);
    const dispatchedByCase = CLI_SOURCE.includes(`case '${command}':`);
    expect(dispatchedByIf || dispatchedByCase).toBe(true);
  });

  it('the default-branch error message does not list a command missing from this list', () => {
    const match = /unknown command[\s\S]*?Available: ([\s\S]*?)`,\s*\);/.exec(CLI_SOURCE);
    expect(match).not.toBeNull();
    const listed = match![1]!
      .replace(/[`+\n]/g, ' ')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(listed.length).toBeGreaterThan(0);
    for (const command of listed) {
      expect(REAL_CLI_COMMANDS).toContain(command);
    }
  });
});

describe('bridge: LOOP_PHASES / READ_ONLY_REPORTS commands are real', () => {
  it('every LOOP_PHASES command exists in the real CLI command list', () => {
    for (const loopPhase of LOOP_PHASES) {
      for (const command of loopPhase.commands) {
        expect(REAL_CLI_COMMANDS).toContain(command);
      }
    }
  });

  it('every READ_ONLY_REPORTS command exists in the real CLI command list', () => {
    for (const report of READ_ONLY_REPORTS) {
      expect(REAL_CLI_COMMANDS).toContain(report.command);
    }
  });

  it('covers all five SPEC §7 loop phases exactly once', () => {
    const phases = LOOP_PHASES.map((p) => p.phase);
    expect(phases).toEqual(['declare', 'dispatch', 'observe', 'verify', 'settle']);
  });

  it('covers land, view, and watch exactly once', () => {
    const names = READ_ONLY_REPORTS.map((r) => r.name);
    expect(names.sort()).toEqual(['land', 'view', 'watch']);
  });

  it('HANDSHAKE_REQUIREMENT names the real handshake command and non-empty checks', () => {
    expect(HANDSHAKE_REQUIREMENT.command).toBe('tallyback handshake');
    expect(HANDSHAKE_REQUIREMENT.checks.length).toBeGreaterThan(0);
    for (const check of HANDSHAKE_REQUIREMENT.checks) {
      expect(check.length).toBeGreaterThan(0);
    }
  });
});

describe('bridge: FEATURE_INTERFACES exposes land/view/watch', () => {
  it('FEATURE_INTERFACES includes land, view, and watch', () => {
    expect(FEATURE_INTERFACES).toContain('land');
    expect(FEATURE_INTERFACES).toContain('view');
    expect(FEATURE_INTERFACES).toContain('watch');
  });

  it('handshake().features includes land, view, and watch', () => {
    const h = handshake();
    expect(h.features).toContain('land');
    expect(h.features).toContain('view');
    expect(h.features).toContain('watch');
  });
});

describe('bridge: Claude Code plugin manifest', () => {
  const pluginPath = join(REPO_ROOT, 'bridge/claude-code/.claude-plugin/plugin.json');

  it('parses as JSON with non-empty name/description/version strings', () => {
    const raw = readFileSync(pluginPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed.name).toBe('string');
    expect((parsed.name as string).length).toBeGreaterThan(0);
    expect(typeof parsed.description).toBe('string');
    expect((parsed.description as string).length).toBeGreaterThan(0);
    expect(typeof parsed.version).toBe('string');
    expect((parsed.version as string).length).toBeGreaterThan(0);
  });
});

describe('bridge: Claude Code skill file', () => {
  const skillPath = join(REPO_ROOT, 'bridge/claude-code/skills/tallyback/SKILL.md');
  const raw = readFileSync(skillPath, 'utf8');

  it('has a leading YAML frontmatter block with a non-empty description', () => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    expect(match).not.toBeNull();
    const frontmatter = match![1]!;
    const descMatch = /^description:\s*(.+)$/m.exec(frontmatter);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1]!.trim().length).toBeGreaterThan(0);
  });

  it('body mentions every LOOP_PHASES phase name', () => {
    for (const loopPhase of LOOP_PHASES) {
      expect(raw.toLowerCase()).toContain(loopPhase.phase.toLowerCase());
    }
  });

  it('body mentions every READ_ONLY_REPORTS report name', () => {
    for (const report of READ_ONLY_REPORTS) {
      expect(raw.toLowerCase()).toContain(report.name.toLowerCase());
    }
  });

  it('mentions the handshake command', () => {
    expect(raw).toContain('tallyback handshake');
  });

  describe('Execution Fit Check', () => {
    const fit = raw.slice(raw.indexOf('### Execution Fit Check'), raw.indexOf('### Observe'));

    it('is a section of its own with the three labels', () => {
      expect(fit.length).toBeGreaterThan(0);
      for (const label of ['`FIT`', '`CONDITIONAL`', '`NOT_FIT`']) expect(fit).toContain(label);
    });

    it('asks the four concrete questions', () => {
      for (const q of [
        'Hardest part',
        'Evidence',
        'Not authorised / not equipped',
        'Stop signal',
      ]) {
        expect(fit).toContain(q);
      }
    });

    it('records Fit as an execution_choice Decision on the Attempt, using real flags', () => {
      expect(fit).toContain('tallyback decision --subject-kind attempt');
      expect(fit).toContain('--role execution_choice');
      expect(CLI_SOURCE).toContain("case 'decision':");
    });

    it('never lets a new executor inherit a Fit: it must supersede the one view shows', () => {
      expect(fit).toContain('A Fit belongs to the executor that made it.');
      expect(fit).toContain('never inherits another executor');
      expect(fit).toContain('attempts[].execution_fit');
      expect(fit).toContain('--supersedes <that decision_id>');
    });
  });
});
