import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnvelope, buildJsonFileName, buildPerformanceReport, buildReceivedSummaryText, buildSharePerformanceText, calculateKeyboardInset, compareIncoming, ensurePayload, exportRecord, normalizeEvk,
  mergeDirectoryItems, mergePenaltyRecord, penaltySummary, sameLogicalShift, sortPersonnelByRegistry, toIstanbulIso, validateEnvelope
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

test('görevliler küçük sicil numarası en üstte olacak şekilde sıralanır', () => {
  const sorted = sortPersonnelByRegistry([
    { sicil: '300', ad: 'Üç' },
    { sicil: '', ad: 'Sicilsiz' },
    { sicil: '20', ad: 'Bir' },
    { sicil: '100', ad: 'İki' }
  ]);
  assert.deepEqual(sorted.map(item => item.sicil), ['20', '100', '300', '']);
});

test('tek ve toplu JSON dosya adları ekip, birim ve tarih bilgisini öne taşır', () => {
  const first = normalizeEvk(record({ teamCode: '59635', dutyType: 'GUNDUZ', sourceUnit: 'MALKARA', startDateTime: '2026-09-24T08:00:00+03:00' }));
  const second = normalizeEvk(record({ evkId: '1789758432123-482732', teamCode: '59636', sourceUnit: 'MALKARA', startDateTime: '2026-09-25T08:00:00+03:00' }));
  assert.equal(buildJsonFileName([first]), '59635_Gündüz_24_Eylül.json');
  assert.equal(buildJsonFileName([first, second]), 'Malkara_24_25_Eylül.json');
  assert.equal(buildJsonFileName([first, { ...second, sourceUnit: 'CORLU' }]), 'Toplu_icraat_24_25_Eylül.json');
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

test('ceza kartı düz cümle özetini toplam tutar ve ek işlemlerle oluşturur', () => {
  const summary = penaltySummary({
    type: 'DRIVER', count: 3,
    articles: [{ code: '78/1-a', amount: 500 }, { code: '34/a', amount: 500 }],
    vehicleBan: true, licenseCancel: true, parking: true
  });
  assert.equal(summary, 'Sürücüye: 78/1-a, 34/a → 3.000 ₺. Araç Men. Belge İptal. Otoparka (3 Adet)');
});

test('aynı ceza işlemi yeni satır açmadan mevcut adedi artırır', () => {
  const existing = {
    penaltyId: 'penalty-existing', type: 'DRIVER', origin: 'NORMAL', count: 1,
    articles: [{ code: '78/1-a', amount: 500 }, { code: '34/a', amount: 250 }],
    vehicleBan: false, parking: false, licenseCancel: false, parkingOnly: false
  };
  const incoming = {
    penaltyId: 'penalty-new', type: 'DRIVER', origin: 'NORMAL', count: 2,
    articles: [{ code: '34/a', amount: 250 }, { code: '78/1-a', amount: 500 }],
    vehicleBan: false, parking: false, licenseCancel: false, parkingOnly: false
  };
  const result = mergePenaltyRecord([existing], incoming);
  assert.equal(result.merged, true);
  assert.equal(result.count, 3);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].penaltyId, 'penalty-existing');
  assert.equal(result.records[0].count, 3);
});

test('ceza türü veya ek işlemi farklıysa ayrı satır korunur', () => {
  const existing = {
    penaltyId: 'penalty-existing', type: 'DRIVER', count: 1,
    articles: [{ code: '78/1-a', amount: 500 }], parking: false
  };
  const differentType = mergePenaltyRecord([existing], {
    penaltyId: 'penalty-plate', type: 'PLATE', count: 1,
    articles: [{ code: '78/1-a', amount: 500 }], parking: false
  });
  const differentAction = mergePenaltyRecord([existing], {
    penaltyId: 'penalty-parking', type: 'DRIVER', count: 1,
    articles: [{ code: '78/1-a', amount: 500 }], parking: true
  });
  assert.equal(differentType.merged, false);
  assert.equal(differentAction.merged, false);
  assert.equal(differentType.records.length, 2);
  assert.equal(differentAction.records.length, 2);
});

test('birleşik alınan icraat özeti ekrandaki bütün grupları metne dönüştürür', () => {
  const text = buildReceivedSummaryText('Tüm İcraatlar', 'Malkara · 24.09.2026', {
    teamCounts: { GUNDUZ: 2, GECE: 3, ARA_EKIP: 4, RADAR: 5 },
    controlCounts: { K1_A: 1, K2_A: 2, K2_B: 3, K4_A: 4, K5: 5, K6: 6 },
    accidentCounts: { fatalAccidentCount: 7, deathCount: 8, injuryAccidentCount: 9, injuredCount: 10 },
    driverArticles: 11, plateArticles: 12, speed: 13, belt: 14, alcohol: 15
  });
  assert.match(text, /^\*Tüm İcraatlar\*\nMalkara/);
  assert.match(text, /\*Ekip sayıları\*\n12\/36 Ekip Sayısı: 5\nAra Ekip Sayısı: 4\nRadar Sayısı: 5/);
  assert.match(text, /\*Kontroller\*\nK1: 1[\s\S]*K6: 6/);
  assert.match(text, /\*Kazalar\*[\s\S]*Yaralı: 10/);
  assert.match(text, /\*Ceza adetleri\*[\s\S]*Tescil plakasına: 12/);
  assert.match(text, /\*Ceza türleri\*[\s\S]*Alkol: 15$/);
});

test('icraat özeti kurum başlığı ile hız, kemer, alkol ve not satırlarını üretir', () => {
  const report = buildPerformanceReport(normalizeEvk(record({
    payload: {
      controls: { K1_A: 5 },
      penalties: [
        { type: 'DRIVER', count: 2, articles: [{ code: '51/2-b-1', amount: 2000 }], vehicleBan: false },
        { type: 'PLATE', count: 1, articles: [{ code: '78/1-a', amount: 1000 }], vehicleBan: false },
        { type: 'DRIVER', count: 3, articles: [{ code: '48/5', amount: 500 }], vehicleBan: false }
      ],
      personnel: [], roads: [], accidents: {}, note: 'Deneme notu'
    }
  })));
  assert.match(report.text, /Malkara Bölge Trafik Denetleme İstasyon Amirliği/);
  assert.match(report.text, /Kontrol edilen araç sayısı: 7/);
  assert.match(report.text, /Hız: 2 adet\nKemer: 1 adet\nAlkol: 3 adet/);
  assert.match(report.text, /Not: Deneme notu/);
});

test('WhatsApp paylaşım metni birinci projenin kısa ve kalın işaretli biçimini kullanır', () => {
  const evk = normalizeEvk(record({
    teamCode: '59635',
    payload: {
      controls: { K1_A: 5 },
      penalties: [{ type: 'DRIVER', count: 2, articles: [{ code: '51/2-b-1', amount: 2000 }] }],
      personnel: [], roads: [], accidents: {}, note: 'Deneme notu'
    }
  }));
  const shared = buildSharePerformanceText(evk);
  assert.match(shared, /^\*Malkara Bölge Trafik Denetleme İstasyon Amirliği\*/);
  assert.match(shared, /\*59635\* kod nolu ekip/);
  assert.match(shared, /1\) 51\/2-b-1 \(2 adet\)/);
  assert.match(shared, /\*Toplam Ceza: 2 adet\*/);
  assert.match(shared, /\*Not:\* Deneme notu/);
  assert.doesNotMatch(shared, /İşlem Yapılan|Hız:|Kemer:|Alkol:/);
});

test('radar icraat özeti ekip ve operatör cezalarını tek madde toplamında gösterir', () => {
  const evk = normalizeEvk(record({
    dutyType: 'RADAR',
    payload: {
      penalties: [
        { origin: 'RADAR_TEAM', type: 'DRIVER', count: 2, articles: [{ code: '51/2-b-2', amount: 4000 }] },
        { origin: 'RADAR_OPERATOR', type: 'PLATE', count: 3, articles: [{ code: '51/2-b-2', amount: 4000 }] }
      ],
      personnel: [], roads: [], controls: {}, accidents: {}, note: 'Radar notu'
    }
  }));
  const report = buildPerformanceReport(evk);
  assert.match(report.text, /Kontrol edilen araç sayısı: 5\nK3:5/);
  assert.match(report.text, /1\) 51\/2-b-2 \(5 adet\)/);
  assert.match(report.text, /Sürücüye: 2 adet\nPlakasına: 3 adet/);
  assert.doesNotMatch(report.text, /Hız:/);
  assert.match(report.text, /Not: Radar notu/);
  const shared = buildSharePerformanceText(evk);
  assert.match(shared, /^\*Malkara Bölge Trafik Denetleme İstasyon Amirliği\*/);
  assert.match(shared, /\*Kontrol edilen araç sayısı: 5\*/);
  assert.match(shared, /\*Arz ederim\.\*$/);
});
