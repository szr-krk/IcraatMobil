export const UNITS = [
  { code: 'MERKEZ', label: 'Merkez Bölge' },
  { code: 'CORLU', label: 'Çorlu' },
  { code: 'MALKARA', label: 'Malkara' }
];

export const DUTIES = {
  GUNDUZ: 'Gündüz',
  GECE: 'Gece',
  ARA_EKIP: 'Ara Ekip',
  RADAR: 'Radar'
};

export const PENALTY_TYPES = {
  DRIVER: 'Sürücüye',
  PLATE: 'Plakasına',
  PASSENGER: 'Yolcuya',
  PEDESTRIAN: 'Yayaya',
  OTHER: 'Diğer'
};

export const CONTROLS = [
  ['K1_A', 'K1/A', 'Yük Taşımacılığı Denetimi'],
  ['K1_B', 'K1/B', 'KDİ’lerde Yük Taşımacılığı Denetimi'],
  ['K2_A', 'K2/A', 'Tarifeli Yolcu Taşımacılığı Denetimi'],
  ['K2_B', 'K2/B', 'Tarifesiz Yolcu Taşımacılığı Denetimi'],
  ['K2_C', 'K2/C', 'Şehiriçi Yolcu Taşımacılığı Denetimi'],
  ['K2_D', 'K2/D', 'Personel/İşçi Servis Taşımacılığı Denetimi'],
  ['K4_A', 'K4/A', 'Alkol Denetimi'],
  ['K4_B', 'K4/B', 'Uyuşturucu/Uyarıcı Madde Denetimi'],
  ['K5', 'K5', 'Motosiklet ve Motorlu Bisiklet Denetimi'],
  ['K6', 'K6', 'Emniyet Kemeri Denetimi'],
  ['K7_A', 'K7/A', 'Trafik Işık İhlali Denetimi'],
  ['K7_B', 'K7/B', 'Trafik İşaretleri İhlali Denetimi'],
  ['K8', 'K8', 'Kazalara Müdahaledeki Denetimler'],
  ['K9', 'K9', 'Resmi Araç Denetimi'],
  ['K10', 'K10', 'Müşterek/Diğer Denetimler'],
  ['K11', 'K11', 'Okul Servis Araçları Denetimi'],
  ['K12', 'K12', 'Terminal Denetimi'],
  ['K13_A', 'K13/A', 'EGM Birimlerine Ait Araçlarla Nakiller'],
  ['K13_B', 'K13/B', 'Hizmet Alımı Araçlarla Nakiller'],
  ['K14', 'K14', 'Tehlikeli Madde Taşımacılığı Denetimi'],
  ['K15_A', 'K15/A', 'Tarım İşçileri Taşımacılığı Denetimi'],
  ['K15_B', 'K15/B', 'Tarım Araçları Denetimi'],
  ['K16_A', 'K16/A', 'Helikopter ile Havadan Trafik Denetimi'],
  ['K16_B', 'K16/B', 'İHA/Drone ile Havadan Trafik Denetimi']
];

export const ACCIDENT_FIELDS = [
  ['fatalAccidentCount', 'Ölümlü Kaza Sayısı'],
  ['deathCount', 'Ölü Sayısı'],
  ['injuryAccidentCount', 'Yaralanmalı Kaza Sayısı'],
  ['injuredCount', 'Yaralı Sayısı']
];

const unitMap = Object.fromEntries(UNITS.map(item => [item.code, item.label]));
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
});

export function unitLabel(code) {
  return unitMap[code] || code;
}

export function dutyLabel(code) {
  return DUTIES[code] || code;
}

export function displayDateTime(epochMillis) {
  return dateTimeFormatter.format(new Date(epochMillis)).replace(',', '');
}

export function toIstanbulIso(date, time) {
  return `${date}T${time}:00+03:00`;
}

export function makeRandomId(now = Date.now()) {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `${now}-${random}`;
}

export function makeChildId(prefix) {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e8)}`;
}

export function directoryItemKey(item, type) {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
  if (type === 'personnel') {
    const registry = normalize(item.sicil);
    return registry ? `sicil:${registry}` : `ad:${normalize(item.ad)}|${normalize(item.soyad)}`;
  }
  return `yol:${normalize(item.yolad)}`;
}

export function mergeDirectoryItems(current, incoming, type) {
  const merged = [];
  const keys = new Set();
  for (const item of [...(current || []), ...(incoming || [])]) {
    if (!item || typeof item !== 'object') continue;
    const key = directoryItemKey(item, type);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    merged.push(structuredClone(item));
  }
  return merged;
}

export function calculateKeyboardInset(layoutHeight, visualHeight, offsetTop = 0) {
  const values = [layoutHeight, visualHeight, offsetTop].map(Number);
  if (!values.every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(values[0] - values[1] - values[2]));
}

export function penaltySummary(record) {
  const count = Number.isInteger(Number(record?.count)) && Number(record.count) > 0 ? Number(record.count) : 1;
  const articles = Array.isArray(record?.articles) ? record.articles : [];
  const codes = articles.map(article => String(article.code || '').trim()).filter(Boolean).join(', ') || 'Madde yok';
  const unitAmount = articles.reduce((total, article) => total + (Number(article.amount) || 0), 0);
  const totalAmount = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(unitAmount * count);
  const type = record?.parkingOnly
    ? 'Yalnızca Otopark'
    : record?.origin === 'RADAR_OPERATOR'
      ? 'Radar · Plaka'
      : record?.origin === 'RADAR_TEAM'
        ? 'Radar · Ekip'
        : (PENALTY_TYPES[record?.type] || record?.type || 'Diğer');
  const flags = [
    record?.vehicleBan && 'Araç Men',
    record?.licenseCancel && 'Belge İptal',
    record?.parking && 'Otoparka'
  ].filter(Boolean);
  return `${type}: ${codes} → ${totalAmount} ₺.${flags.length ? ` ${flags.join('. ')} ` : ' '}(${count} Adet)`;
}

const reportDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric'
});
const reportTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false
});

export function performanceUnitName(sourceUnit) {
  return sourceUnit === 'MERKEZ'
    ? 'Tekirdağ Bölge Trafik Denetleme Şube Müdürlüğü'
    : 'Malkara Bölge Trafik Denetleme İstasyon Amirliği';
}

function reportCount(section, key) {
  const legacy = { K1_A: 'k1', K2_A: 'k2A', K2_B: 'k2B', K4_A: 'k4', K5: 'k5', K6: 'k6' }[key];
  const value = Object.hasOwn(section || {}, key) ? section[key] : (legacy ? section?.[legacy] : 0);
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function joinedNames(values) {
  const clean = values.filter(Boolean);
  if (clean.length < 2) return clean[0] || '';
  if (clean.length === 2) return `${clean[0]} ve ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} ve ${clean.at(-1)}`;
}

export function buildPerformanceReport(evk, noteOverride) {
  const payload = ensurePayload(evk);
  const records = payload.penalties.filter(record => record.origin !== 'RADAR_OPERATOR');
  const articleCounts = new Map();
  const articleTypes = new Map();
  const operationCounts = Object.fromEntries(Object.keys(PENALTY_TYPES).map(type => [type, 0]));
  const articleTypeCounts = Object.fromEntries(Object.keys(PENALTY_TYPES).map(type => [type, 0]));
  let totalAmount = 0;
  let vehicleBans = 0;
  let parkingCount = 0;
  let licenseCancelCount = 0;
  let speedCount = 0;
  let beltCount = 0;
  let alcoholCount = 0;
  let k3 = 0;

  records.forEach(record => {
    const parsedCount = Number.parseInt(record.count, 10);
    const count = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 1;
    if (Object.hasOwn(operationCounts, record.type)) operationCounts[record.type] += count;
    if (record.vehicleBan) vehicleBans += count;
    if (record.parking) parkingCount += count;
    if (record.licenseCancel) licenseCancelCount += count;
    let speedOperation = false;
    (record.articles || []).forEach(article => {
      const code = String(article.code || '').trim();
      if (!code) return;
      const normalized = code.toLocaleLowerCase('tr-TR');
      articleCounts.set(code, (articleCounts.get(code) || 0) + count);
      if (!articleTypes.has(code)) articleTypes.set(code, {});
      const distribution = articleTypes.get(code);
      if (Object.hasOwn(operationCounts, record.type)) {
        distribution[record.type] = (distribution[record.type] || 0) + count;
        articleTypeCounts[record.type] += count;
      }
      totalAmount += (Number(article.amount) || 0) * count;
      if (normalized.startsWith('51')) { speedCount += count; speedOperation = true; }
      if (normalized === '78/1-a') beltCount += count;
      if (normalized.startsWith('48')) alcoholCount += count;
    });
    if (speedOperation) k3 += count;
  });

  const controlRows = [];
  let inspectedVehicles = k3;
  CONTROLS.forEach(([key, code]) => {
    const count = reportCount(payload.controls, key);
    inspectedVehicles += count;
    if (count > 0) controlRows.push(`${code}:${count}`);
    if (key === 'K2_D' && k3 > 0) controlRows.push(`K3:${k3}`);
  });

  const start = new Date(evk.startEpochMillis ?? evk.startDateTime);
  const end = new Date(evk.endEpochMillis ?? evk.endDateTime);
  const startDate = reportDateFormatter.format(start);
  const endDate = reportDateFormatter.format(end);
  const dateText = startDate === endDate ? `${startDate} tarihinde` : `${startDate} - ${endDate} tarihinde`;
  const timeText = `${reportTimeFormatter.format(start)} - ${reportTimeFormatter.format(end)}`;
  const roads = (payload.roads || []).map(road => String(road.yolad || '').trim()).filter(Boolean);
  const roadNames = joinedNames(roads);
  const personnel = (payload.personnel || []).map(person => {
    const name = `${person.ad || ''} ${person.soyad || ''}`.trim();
    const registry = String(person.sicil || '').trim();
    return `${name}${registry ? ` (${registry})` : ''}`.trim();
  }).filter(Boolean);
  const note = String(noteOverride ?? payload.note ?? '').trim();
  const lines = [performanceUnitName(evk.sourceUnit), ''];
  let intro = `${dateText} ${timeText} saatleri arasında ${evk.teamCode} kod nolu ekip olarak`;
  if (roadNames) intro += ` ${roadNames}${roads.length === 1 ? ' yolunda' : ' yollarında'}`;
  lines.push(`${intro} yapmış olduğumuz uygulama icraatı ve görevler aşağıda çıkarılmıştır.`, '');
  lines.push(`${evk.teamCode}${roadNames ? ` (${roadNames}${roads.length === 1 ? ' yolunda' : ' yollarında'} görevli personeller)` : ''}`);
  lines.push(...personnel, '', `Kontrol edilen araç sayısı: ${inspectedVehicles}`);
  lines.push(...(controlRows.length ? controlRows : ['—']), '', 'Yazılan Ceza Maddeleri:');

  const sortedArticles = [...articleCounts.keys()].sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true }));
  if (!sortedArticles.length) lines.push('—');
  sortedArticles.forEach((code, index) => {
    const distribution = articleTypes.get(code) || {};
    const parts = Object.entries(PENALTY_TYPES)
      .map(([type, label]) => distribution[type] > 0 ? `${label} ${distribution[type]}` : '')
      .filter(Boolean);
    lines.push(`${index + 1}) ${code} (${parts.join(' - ') || `${articleCounts.get(code)} adet`})`);
  });

  const totalPenaltyCount = [...articleCounts.values()].reduce((total, value) => total + value, 0);
  lines.push('', `Toplam Ceza: ${totalPenaltyCount} adet`);
  Object.entries(PENALTY_TYPES).forEach(([type, label]) => {
    if (articleTypeCounts[type] > 0) lines.push(`${label}: ${articleTypeCounts[type]} adet`);
  });
  lines.push('', 'İşlem Yapılan');
  Object.entries(PENALTY_TYPES).forEach(([type, label]) => {
    if (operationCounts[type] > 0) lines.push(`${label}: ${operationCounts[type]} adet`);
  });
  lines.push('', `Toplam Ceza Miktarı: ${new Intl.NumberFormat('tr-TR').format(totalAmount)}₺`);
  if (vehicleBans > 0) lines.push(`Trafikten Men Edilen Araç Sayısı: ${vehicleBans} adet`);
  if (parkingCount > 0) lines.push(`Otoparka Çekilen Araç Sayısı: ${parkingCount} adet`);
  if (licenseCancelCount > 0) lines.push(`İptal Edilen Sürücü Belgesi Sayısı: ${licenseCancelCount} adet`);
  ACCIDENT_FIELDS.forEach(([key, label]) => {
    const count = reportCount(payload.accidents, key);
    if (count > 0) lines.push(`${label}: ${count} adet`);
  });
  lines.push('', `Hız: ${speedCount} adet`, `Kemer: ${beltCount} adet`, `Alkol: ${alcoholCount} adet`);
  if (note) lines.push('', `Not: ${note}`);
  lines.push('', 'Arz ederim.');

  return {
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    note,
    speedCount,
    beltCount,
    alcoholCount
  };
}

export function ensurePayload(evk) {
  let payload = evk.payload;
  if (!payload && typeof evk.payloadJson === 'string') {
    try { payload = JSON.parse(evk.payloadJson); } catch { payload = {}; }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
  return {
    ...payload,
    payloadVersion: Number.isInteger(payload.payloadVersion) ? payload.payloadVersion : 1,
    penalties: Array.isArray(payload.penalties) ? payload.penalties : [],
    accidents: payload.accidents && typeof payload.accidents === 'object' ? payload.accidents : {},
    controls: payload.controls && typeof payload.controls === 'object' ? payload.controls : {},
    personnel: Array.isArray(payload.personnel) ? payload.personnel : [],
    roads: Array.isArray(payload.roads) ? payload.roads : []
  };
}

export function normalizeEvk(record) {
  const startEpochMillis = Number.isFinite(record.startEpochMillis)
    ? record.startEpochMillis : Date.parse(record.startDateTime);
  const endEpochMillis = Number.isFinite(record.endEpochMillis)
    ? record.endEpochMillis : Date.parse(record.endDateTime);
  return {
    ...record,
    recordType: 'EVK',
    revision: Number(record.revision),
    createdAt: Number(record.createdAt),
    updatedAt: Number(record.updatedAt),
    startEpochMillis,
    endEpochMillis,
    payload: ensurePayload(record)
  };
}

export function validateEnvelope(value) {
  if (!value || typeof value !== 'object') throw new Error('JSON kök nesnesi geçersiz.');
  if (value.app !== 'ICRAAT') throw new Error('Bu dosya İcraat uygulamasına ait değil.');
  if (value.schemaVersion !== 1) throw new Error('Desteklenmeyen JSON şema sürümü.');
  if (!Array.isArray(value.records)) throw new Error('JSON içinde records listesi bulunamadı.');
  return value.records.map((record, index) => validateEvk(record, index));
}

function validateEvk(record, index) {
  const label = `Kayıt ${index + 1}`;
  if (!record || record.recordType !== 'EVK') throw new Error(`${label}: desteklenmeyen kayıt türü.`);
  const requiredStrings = ['evkId', 'sourceUnit', 'reportPeriod', 'teamCode', 'dutyType', 'startDateTime', 'endDateTime'];
  for (const key of requiredStrings) {
    if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`${label}: ${key} alanı eksik.`);
  }
  if (!UNITS.some(unit => unit.code === record.sourceUnit)) throw new Error(`${label}: birim kodu geçersiz.`);
  if (!Object.hasOwn(DUTIES, record.dutyType)) throw new Error(`${label}: görev türü geçersiz.`);
  if (!Number.isInteger(record.revision) || record.revision < 0) throw new Error(`${label}: revision geçersiz.`);
  if (!Number.isFinite(Number(record.createdAt)) || !Number.isFinite(Number(record.updatedAt))) throw new Error(`${label}: zaman bilgisi geçersiz.`);
  if (!Number.isFinite(Date.parse(record.startDateTime)) || !Number.isFinite(Date.parse(record.endDateTime))) throw new Error(`${label}: tarih/saat okunamadı.`);
  return normalizeEvk(record);
}

export function exportRecord(evk) {
  const { startEpochMillis, endEpochMillis, payloadJson, ...record } = evk;
  return { ...record, recordType: 'EVK', payload: ensurePayload(evk) };
}

export function buildEnvelope(evks, exportType) {
  const sources = new Set(evks.map(evk => evk.sourceUnit));
  return {
    app: 'ICRAAT',
    schemaVersion: 1,
    exportType,
    createdAt: Date.now(),
    sourceUnit: sources.size === 1 ? [...sources][0] : 'MIXED',
    records: evks.map(exportRecord)
  };
}

export function sameLogicalShift(a, b) {
  return a.sourceUnit === b.sourceUnit && a.teamCode === b.teamCode
    && a.startDateTime === b.startDateTime && a.endDateTime === b.endDateTime
    && a.evkId !== b.evkId;
}

export function compareIncoming(local, incoming) {
  if (incoming.revision !== local.revision) return incoming.revision > local.revision ? 'NEWER' : 'OLDER';
  if (incoming.updatedAt !== local.updatedAt) return 'SAME_REVISION_DIFFERENT_TIME';
  return JSON.stringify(exportRecord(local)) === JSON.stringify(exportRecord(incoming)) ? 'IDENTICAL' : 'SAME_METADATA_DIFFERENT_CONTENT';
}
