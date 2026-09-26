import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFER_KINDS, aggregateTransfers, createTeamTransfer, decodeTransfer, encodeTransfer, transferAction
} from '../transfer.js';
import { summarizeDailyReport } from '../report.js';

function evk(teamCode, dutyType, controls = {}, accidents = {}, penalties = []) {
  return {
    recordType: 'EVK', evkId: `id-${teamCode}`, sourceUnit: 'MALKARA', teamCode, dutyType,
    startEpochMillis: Date.parse('2026-09-24T08:00:00+03:00'),
    endEpochMillis: Date.parse('2026-09-24T20:00:00+03:00'),
    payload: { payloadVersion: 1, controls, accidents, penalties, personnel: [], roads: [] }
  };
}

test('ekip özeti kısa bağlantı koduna çevrilip kayıpsız çözülür', () => {
  const source = evk('59635', 'GUNDUZ', { K1_A: 35, K2_A: 12 }, { injuryAccidentCount: 1, injuredCount: 2 }, [{
    penaltyId: 'p1', type: 'DRIVER', origin: 'NORMAL', count: 3,
    articles: [{ code: '78/1-a', amount: 100 }]
  }]);
  const encoded = encodeTransfer(createTeamTransfer(source));
  const decoded = decodeTransfer(encoded);
  assert.ok(encoded.length < 180);
  assert.equal(decoded.packetKind, TRANSFER_KINDS.TEAM);
  assert.equal(decoded.teamCode, '59635');
  assert.equal(decoded.summary.controlCounts.K1_A, 35);
  assert.equal(decoded.summary.accidentCounts.injuredCount, 2);
  assert.equal(decoded.summary.driverArticles, 3);
  assert.equal(decoded.summary.belt, 3);
});

test('ekip, gündüz ve birim paketleri aynı sayısal yapıyla kademeli toplanır', () => {
  const first = createTeamTransfer(evk('59635', 'GUNDUZ', { K1_A: 2 }));
  const second = createTeamTransfer(evk('59636', 'RADAR', { K1_A: 5 }));
  const day = aggregateTransfers([first, second], TRANSFER_KINDS.DAY);
  const night = createTeamTransfer(evk('59637', 'GECE', { K1_A: 7 }));
  const unit = aggregateTransfers([day, night], TRANSFER_KINDS.UNIT);
  assert.equal(day.summary.teamCounts.GUNDUZ, 1);
  assert.equal(day.summary.teamCounts.RADAR, 1);
  assert.equal(unit.summary.teamCounts.GECE, 1);
  assert.equal(unit.summary.controlCounts.K1_A, 9);
  assert.equal(transferAction([first, second]), TRANSFER_KINDS.DAY);
  assert.equal(transferAction([day, night]), TRANSFER_KINDS.UNIT);
  assert.equal(transferAction([unit]), 'PDF');
});

test('birim özeti mevcut PDF rapor özetleyicisi tarafından doğrudan kullanılır', () => {
  const first = createTeamTransfer(evk('59635', 'GUNDUZ', { K2_B: 4 }, { fatalAccidentCount: 1 }));
  const second = createTeamTransfer(evk('59636', 'GECE', { K2_B: 6 }, { fatalAccidentCount: 2 }));
  const unit = aggregateTransfers([first, second], TRANSFER_KINDS.UNIT);
  const report = summarizeDailyReport([unit]);
  assert.equal(report.units.MALKARA.teamTotal, 2);
  assert.equal(report.units.MALKARA.controlCounts.K2_B, 10);
  assert.equal(report.units.MALKARA.accidentCounts.fatalAccidentCount, 3);
});

test('bozulmuş bağlantı özeti kabul edilmez', () => {
  const encoded = encodeTransfer(createTeamTransfer(evk('59635', 'GUNDUZ')));
  const changed = `${encoded.slice(0, -1)}${encoded.endsWith('a') ? 'b' : 'a'}`;
  assert.throws(() => decodeTransfer(changed), /bozulmuş/);
});

test('radar ekip bağlantısı yalnız operatörün plakaya yazdığı cezaları taşır', () => {
  const radar = evk('59640', 'RADAR', { K1_A: 9 }, { injuryAccidentCount: 2 }, [
    { penaltyId: 'team', type: 'DRIVER', origin: 'RADAR_TEAM', count: 7, articles: [{ code: '51/2-b-2', amount: 100 }] },
    { penaltyId: 'operator', type: 'PLATE', origin: 'RADAR_OPERATOR', count: 3, articles: [{ code: '51/2-b-4', amount: 100 }] }
  ]);
  const decoded = decodeTransfer(encodeTransfer(createTeamTransfer(radar)));
  assert.equal(decoded.summary.driverArticles, 0);
  assert.equal(decoded.summary.plateArticles, 3);
  assert.equal(decoded.summary.speed, 3);
  assert.equal(decoded.summary.controlCounts.K1_A, 0);
  assert.equal(decoded.summary.accidentCounts.injuryAccidentCount, 0);
});
