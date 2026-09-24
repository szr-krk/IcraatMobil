import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnvelope, calculateKeyboardInset, compareIncoming, ensurePayload, exportRecord, normalizeEvk,
  mergeDirectoryItems, sameLogicalShift, toIstanbulIso, validateEnvelope
} from '../domain.js';

function record(overrides = {}) {
  return {
    recordType: 'EVK',
    evkId: '1789758432123-482731',
    revision: 1,
    createdAt: 1789758432123,
    updatedAt: 1789764125874,
    sourceUnit: 'MALKARA',
    reportPeriod: '2026-09-18',
    teamCode: '34',
    dutyType: 'GUNDUZ',
    startDateTime: '2026-09-18T08:00:00+03:00',
    endDateTime: '2026-09-18T20:00:00+03:00',
    payload: { payloadVersion: 1, unknownSection: { preserved: true } },
    ...overrides
  };
}

test('İstanbul ISO tarihi sabit +03:00 ofseti taşır', () => {
  assert.equal(toIstanbulIso('2026-09-18', '08:15'), '2026-09-18T08:15:00+03:00');
});

test('payload içindeki bilinmeyen alanlar korunur', () => {
  const payload = ensurePayload(record().payload ? record() : {});
  assert.equal(payload.unknownSection.preserved, true);
  assert.deepEqual(payload.penalties, []);
  assert.deepEqual(payload.personnel, []);
});

test('geçerli EVK zarfı doğrulanır ve epoch alanları hazırlanır', () => {
  const [value] = validateEnvelope({ app: 'ICRAAT', schemaVersion: 1, records: [record()] });
  assert.equal(value.evkId, '1789758432123-482731');
  assert.ok(Number.isFinite(value.startEpochMillis));
});

test('yabancı uygulama JSON dosyası reddedilir', () => {
  assert.throws(() => validateEnvelope({ app: 'OTHER', schemaVersion: 1, records: [] }), /ait değil/);
});

test('tek EVK dışa aktarımı mevcut sözleşmeyi kullanır', () => {
  const envelope = buildEnvelope([normalizeEvk(record())], 'SINGLE_EVK');
  assert.equal(envelope.app, 'ICRAAT');
  assert.equal(envelope.sourceUnit, 'MALKARA');
  assert.equal(envelope.records[0].recordType, 'EVK');
  assert.equal('startEpochMillis' in exportRecord(normalizeEvk(record())), false);
});

test('farklı kimlikli kesin mükerrer vardiya yakalanır', () => {
  assert.equal(sameLogicalShift(record(), record({ evkId: 'other' })), true);
  assert.equal(sameLogicalShift(record(), record({ evkId: 'other', endDateTime: '2026-09-18T21:00:00+03:00' })), false);
});

test('revizyon karşılaştırması eski kaydın yeniyi ezmesini önler', () => {
  assert.equal(compareIncoming(record({ revision: 5 }), record({ revision: 4 })), 'OLDER');
  assert.equal(compareIncoming(record({ revision: 4 }), record({ revision: 5 })), 'NEWER');
});

test('görevli rehberi sicile göre mükerrer kayıt oluşturmaz', () => {
  const merged = mergeDirectoryItems(
    [{ id: '1', sicil: '123', ad: 'Ali', soyad: 'Yılmaz' }],
    [{ id: '2', sicil: '123', ad: 'ALİ', soyad: 'YILMAZ' }, { id: '3', ad: 'Ayşe', soyad: 'Kara' }],
    'personnel'
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, '1');
});

test('yol rehberi büyük küçük harf ve boşluk farkını yok sayar', () => {
  const merged = mergeDirectoryItems(
    [{ id: '1', yolad: 'D-100' }],
    [{ id: '2', yolad: '  d-100  ' }, { id: '3', yolad: 'TEM' }],
    'roads'
  );
  assert.deepEqual(merged.map(item => item.yolad), ['D-100', 'TEM']);
});

test('sanal klavye yüksekliği görsel görünüm farkından hesaplanır', () => {
  assert.equal(calculateKeyboardInset(844, 510, 0), 334);
  assert.equal(calculateKeyboardInset(844, 510, 24), 310);
  assert.equal(calculateKeyboardInset(600, 600, 0), 0);
});
