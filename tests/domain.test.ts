import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apparatusForProgram,
  competitionSeason,
  majorGymnasticsLevel,
} from '../lib/gymnastics.ts';
import { parseMsoDateRange } from '../lib/mso.ts';

test('women and men see the correct apparatus sets', () => {
  assert.deepEqual(apparatusForProgram('female'), [
    'vault',
    'uneven_bars',
    'balance_beam',
    'floor_exercise',
  ]);
  assert.equal(apparatusForProgram('male').length, 6);
});

test('MSO date ranges remain calendar dates', () => {
  assert.deepEqual(parseMsoDateRange('January 17, 2026'), {
    startDate: '2026-01-17',
    endDate: '2026-01-17',
  });
  assert.deepEqual(parseMsoDateRange('January 17, 2026 - January 18, 2026'), {
    startDate: '2026-01-17',
    endDate: '2026-01-18',
  });
  assert.deepEqual(parseMsoDateRange('February 28 - March 2, 2026'), {
    startDate: '2026-02-28',
    endDate: '2026-03-02',
  });
});

test('undated competitions receive an explicit season bucket', () => {
  assert.equal(competitionSeason(null), 'Unscheduled');
  assert.equal(competitionSeason('2026-02-15'), '2025-26');
  assert.equal(competitionSeason('2026-08-15'), '2026-27');
});

test('level chart markers ignore age and session divisions', () => {
  assert.equal(majorGymnasticsLevel('3'), '3');
  assert.equal(majorGymnasticsLevel('3 B'), '3');
  assert.equal(majorGymnasticsLevel('3 Jr A'), '3');
  assert.equal(majorGymnasticsLevel('3 Sr 1'), '3');
  assert.equal(majorGymnasticsLevel('Xcel Gold Jr B'), 'Xcel Gold');
});
