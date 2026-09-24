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
