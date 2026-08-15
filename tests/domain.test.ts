import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apparatusForProgram,
  competitionSeason,
  majorGymnasticsLevel,
} from '../lib/gymnastics.ts';
import { parseMsoDateRange } from '../lib/mso.ts';
import { analyzeCsv, parseCsvImports } from '../lib/imports/csv.ts';

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

test('long-form CSV rows become one meet with normalized events and dates', () => {
  const preview = parseCsvImports([
    'Meet,Date,Level,Event,Score,Place',
    'Winter Classic,2/14/2026,4,Vault,9.125,3',
    'Winter Classic,2/14/2026,4,Bars,8.950,5',
  ].join('\n'));

  assert.equal(preview.meets.length, 1);
  assert.equal(preview.meets[0].startDate, '2026-02-14');
  assert.deepEqual(preview.meets[0].scores, [
    { apparatus: 'vault', value: 9.125, place: 3, startValue: null },
    { apparatus: 'uneven_bars', value: 8.95, place: 5, startValue: null },
  ]);
});

test('wide CSV rows and quoted meet names are supported', () => {
  const preview = parseCsvImports([
    'Competition Name,Start Date,Level,Vault,Bars,Beam,Floor',
    '"Spring Classic, Session 2",2026-03-01,5,9.1,8.8,9.2,9.3',
  ].join('\n'));

  assert.equal(preview.meets[0].name, 'Spring Classic, Session 2');
  assert.equal(preview.meets[0].scores.length, 4);
  assert.equal(preview.meets[0].scores[2].apparatus, 'balance_beam');
});

test('CSV imports reject impossible calendar dates', () => {
  assert.throws(
    () => parseCsvImports('Meet,Date,Event,Score\nBad Date,2/30/2026,Vault,9.1'),
    /valid calendar date/
  );
});

test('CSV analysis suggests known columns and allows custom mappings', () => {
  const csv = [
    'Competition Label,When,Discipline,Result',
    'Mapped Invitational,3/7/2026,Vault,9.275',
  ].join('\n');
  const analysis = analyzeCsv(csv);

  assert.equal(analysis.rowCount, 1);
  assert.equal(analysis.suggestedMapping.name, -1);
  const preview = parseCsvImports(csv, {
    ...analysis.suggestedMapping,
    name: 0,
    startDate: 1,
    event: 2,
    score: 3,
  });
  assert.equal(preview.meets[0].name, 'Mapped Invitational');
  assert.equal(preview.meets[0].scores[0].value, 9.275);
});

test('tab-separated spreadsheet rows use the same import pipeline', () => {
  const preview = parseCsvImports([
    'Meet\tDate\tLevel\tEvent\tScore\tPlace',
    'Copied Results\t4/11/2026\t5 Sr A\tBeam\t9.175\t4',
  ].join('\n'));

  assert.equal(preview.meets[0].name, 'Copied Results');
  assert.equal(preview.meets[0].level, '5 Sr A');
  assert.deepEqual(preview.meets[0].scores[0], {
    apparatus: 'balance_beam',
    value: 9.175,
    place: 4,
    startValue: null,
  });
});
