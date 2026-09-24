import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyReportData, reportPeriodLabel } from '../report.js';

function evk(unit = 'MERKEZ', duty = 'GUNDUZ', start = '2026-09-21T08:00:00+03:00', end = '2026-09-21T20:00:00+03:00') {
  return {
    evkId: `${unit}-${duty}-${start}-${Math.random()}`,
    sourceUnit: unit,
    dutyType: duty,
    teamCode: '44',
    startDateTime: start,
    endDateTime: end,
    startEpochMillis: Date.parse(start),
    endEpochMillis: Date.parse(end),
    payload: { payloadVersion: 1, controls: {}, accidents: {}, penalties: [], personnel: [], roads: [] }
  };
}

function reference(month = '2026-09', base = 100) {
  const controls = ['K1_A', 'K2_A', 'K2_B', 'K4_A', 'K5', 'K6'];
  const units = ['MERKEZ', 'CORLU', 'MALKARA'];
  return {
    app: 'ICRAAT_REFERENCE',
    schemaVersion: 1,
    monthlyTargets: {
      [month]: Object.fromEntries(units.map((unit, unitIndex) => [unit,
        Object.fromEntries(controls.map((key, keyIndex) => [key, (unitIndex + 1) * base + keyIndex]))
      ]))
    }
  };
}

function accidents() {
  return { MERKEZ: [0, 0, 0, 0], CORLU: [0, 0, 0, 0], MALKARA: [0, 0, 0, 0] };
}

function penalty(type, count, origin, ...codes) {
  return {
    penaltyId: `${type}-${origin}-${codes.join('-')}`,
    type,
    count,
    origin,
    articles: codes.map(code => ({ code, amount: 100, year: 2026 }))
  };
}

test('rapor dönemi en erken başlangıç ve en geç bitişten hesaplanır', () => {
  const rows = [
    evk('CORLU', 'GECE', '2026-09-21T20:00:00+03:00', '2026-09-22T02:00:00+03:00'),
    evk('MERKEZ', 'GUNDUZ', '2026-09-20T08:15:00+03:00', '2026-09-22T08:30:00+03:00')
  ];
  const report = buildDailyReportData(rows, accidents(), reference());
  assert.equal(report.periodLabel, '20-22.09.2026');
  assert.equal(report.cells.F9, '20-22.09.2026');
  assert.equal(report.cells.F11, '(08.15-08.30)');
});

test('12/36 gündüz ve geceyi birleştirir, diğer ekip türlerini ayrı tutar', () => {
  const rows = [
    evk('MERKEZ', 'GUNDUZ'), evk('MERKEZ', 'GUNDUZ'), evk('MERKEZ', 'GECE'),
    evk('MERKEZ', 'ARA_EKIP'), evk('MERKEZ', 'RADAR'), evk('CORLU', 'GECE')
  ];
  const report = buildDailyReportData(rows, accidents(), reference());
  assert.deepEqual([report.cells.C23, report.cells.C26, report.cells.C29, report.cells.C32], [3, 1, 1, 5]);
  assert.deepEqual([report.cells.G23, report.cells.G26, report.cells.G29, report.cells.G32], [1, 0, 0, 1]);
  assert.deepEqual([report.cells.O23, report.cells.O26, report.cells.O29, report.cells.O32], [4, 1, 1, 6]);
});

test('kontroller hedef, gerçekleşen, toplam ve oran hücrelerine doğru yerleşir', () => {
  const merkez = evk();
  merkez.payload.controls = { K1_A: 1, K2_A: 2, K2_B: 3, K4_A: 4, K5: 5, K6: 6 };
  const report = buildDailyReportData([merkez], accidents(), reference());
  assert.deepEqual([45, 46, 47, 48, 49, 50, 51].map(row => report.cells[`C${row}`]), [100, 101, 102, 103, 104, 105, 615]);
  assert.deepEqual([45, 46, 47, 48, 49, 50, 51].map(row => report.cells[`E${row}`]), [1, 2, 3, 4, 5, 6, 21]);
  assert.equal(report.cells.C53, 21 / 615);
  assert.equal(report.cells.K53, 0);
});

test('radar ekip cezaları mükerrer sayılmaz, operatör plaka cezaları sayılır', () => {
  const normal = evk();
  normal.payload.penalties = [
    penalty('DRIVER', 2, 'NORMAL', '51/2-b-1', '78/1-a'),
    penalty('PLATE', 3, 'NORMAL', '48/5')
  ];
  const radar = evk('MERKEZ', 'RADAR');
  radar.payload.penalties = [
    penalty('DRIVER', 2, 'RADAR_TEAM', '51/2-b-1'),
    penalty('PLATE', 5, 'RADAR_OPERATOR', '51/2-b-3')
  ];
  const report = buildDailyReportData([normal, radar], accidents(), reference());
  assert.deepEqual([report.cells.E84, report.cells.E86, report.cells.E92], [4, 8, 12]);
  assert.deepEqual([report.cells.E104, report.cells.E105, report.cells.E106], [7, 2, 3]);
});

test('elle girilen üç birim kaza toplamları ve günlük ortalamaları kullanılır', () => {
  const manual = { MERKEZ: [1, 2, 3, 4], CORLU: [5, 6, 7, 8], MALKARA: [9, 10, 11, 12] };
  const report = buildDailyReportData([evk()], manual, reference());
  assert.deepEqual([65, 67, 69, 71].map(row => report.cells[`F${row}`]), [1, 2, 3, 4]);
  assert.deepEqual([65, 67, 69, 71].map(row => report.cells[`R${row}`]), [15, 18, 21, 24]);
  assert.equal(report.cells.F64, '2026\n(Bugüne Kadar)');
  assert.equal(report.cells.F66, 1 / 264);
});

test('eksik hedef ayı, eksik kaza alanı ve geçersiz EVK raporu engeller', () => {
  assert.throws(() => buildDailyReportData([evk()], accidents(), reference('2026-08')), /2026-09/);
  const missing = accidents();
  delete missing.CORLU;
  assert.throws(() => buildDailyReportData([evk()], missing, reference()), /CORLU/);
  const invalid = evk();
  invalid.endEpochMillis = invalid.startEpochMillis;
  assert.throws(() => buildDailyReportData([invalid], accidents(), reference()), /zaman aralığı/);
});

test('dönem etiketi aynı gün, aynı ay ve çapraz yıl biçimlerini korur', () => {
  assert.equal(reportPeriodLabel({ year: 2026, month: 9, day: 21 }, { year: 2026, month: 9, day: 21 }), '21.09.2026');
  assert.equal(reportPeriodLabel({ year: 2026, month: 9, day: 1 }, { year: 2026, month: 9, day: 2 }), '01-02.09.2026');
  assert.equal(reportPeriodLabel({ year: 2026, month: 12, day: 31 }, { year: 2027, month: 1, day: 1 }), '31.12.2026 - 01.01.2027');
});
