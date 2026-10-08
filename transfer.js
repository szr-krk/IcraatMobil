import { summarizeDailyReport } from './report.js';
import { ensurePayload } from './domain.js';

export const TRANSFER_KINDS = Object.freeze({ TEAM: 'E', DAY: 'G', UNIT: 'B' });
export const TRANSFER_KIND_LABELS = Object.freeze({ E: 'Ekip', G: 'Gündüz toplamı', B: 'Birim toplamı' });

const VERSION = 3;
const UNIT_CODES = ['MERKEZ', 'CORLU', 'MALKARA'];
const DUTIES = ['GUNDUZ', 'GECE', 'ARA_EKIP', 'RADAR'];
const CONTROLS = ['K1_A', 'K2_A', 'K2_B', 'K4_A', 'K5', 'K6'];
const ACCIDENTS = ['fatalAccidentCount', 'deathCount', 'injuryAccidentCount', 'injuredCount'];
const TOTAL_FIELDS = 4 + 6 + 4 + 5;

function integer(value, label = 'Değer') {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} geçersiz.`);
  return number;
}

function add(left, right) {
  const total = integer(left) + integer(right);
  if (!Number.isSafeInteger(total)) throw new Error('Özet toplamı sayı sınırını aştı.');
  return total;
}

function emptySummary() {
  return {
    teamCounts: Object.fromEntries(DUTIES.map(key => [key, 0])),
    controlCounts: Object.fromEntries(CONTROLS.map(key => [key, 0])),
    accidentCounts: Object.fromEntries(ACCIDENTS.map(key => [key, 0])),
    driverArticles: 0,
    plateArticles: 0,
    speed: 0,
    belt: 0,
    alcohol: 0
  };
}

function normalizedSummary(source) {
  const result = emptySummary();
  DUTIES.forEach(key => { result.teamCounts[key] = integer(source?.teamCounts?.[key] ?? 0, key); });
  CONTROLS.forEach(key => { result.controlCounts[key] = integer(source?.controlCounts?.[key] ?? 0, key); });
  ACCIDENTS.forEach(key => { result.accidentCounts[key] = integer(source?.accidentCounts?.[key] ?? 0, key); });
  ['driverArticles', 'plateArticles', 'speed', 'belt', 'alcohol'].forEach(key => {
    result[key] = integer(source?.[key] ?? 0, key);
  });
  result.teamTotal = Object.values(result.teamCounts).reduce(add, 0);
  return result;
}

function normalizedRegularTeamCodes(source, packetKind, teamCode, summary) {
  const supplied = Array.isArray(source?.regularTeamCodes) ? source.regularTeamCodes : null;
  const inferred = supplied === null
    && packetKind === TRANSFER_KINDS.TEAM
    && add(summary.teamCounts.GUNDUZ, summary.teamCounts.GECE) > 0
    ? [teamCode]
    : (supplied || []);
  const unique = [];
  const seen = new Set();
  inferred.forEach(value => {
    const code = String(value ?? '').trim();
    if (!/^\d+$/.test(code)) throw new Error('12/36 ekip kodu geçersiz.');
    if (seen.has(code)) return;
    seen.add(code);
    unique.push(code);
  });
  const regularCount = add(summary.teamCounts.GUNDUZ, summary.teamCounts.GECE);
  if (unique.length > regularCount) throw new Error('12/36 ekip kodları ekip sayısıyla uyuşmuyor.');
  return unique;
}

function normalizedSourceRecordCount(source, packetKind, summary) {
  const supplied = source?.sourceRecordCount;
  const fallback = packetKind === TRANSFER_KINDS.TEAM ? 1 : summary.teamTotal;
  const count = integer(supplied ?? fallback, 'Kaynak icraat sayısı');
  if (count < 1) throw new Error('Kaynak icraat sayısı en az 1 olmalıdır.');
  return count;
}

function summaryToVector(summary) {
  const value = normalizedSummary(summary);
  return [
    ...DUTIES.map(key => value.teamCounts[key]),
    ...CONTROLS.map(key => value.controlCounts[key]),
    ...ACCIDENTS.map(key => value.accidentCounts[key]),
    value.driverArticles, value.plateArticles, value.speed, value.belt, value.alcohol
  ];
}

function vectorToSummary(vector) {
  if (!Array.isArray(vector) || vector.length !== TOTAL_FIELDS) throw new Error('Özet alan sayısı geçersiz.');
  const values = vector.map((value, index) => integer(value, `Özet alanı ${index + 1}`));
  let cursor = 0;
  const summary = emptySummary();
  DUTIES.forEach(key => { summary.teamCounts[key] = values[cursor++]; });
  CONTROLS.forEach(key => { summary.controlCounts[key] = values[cursor++]; });
  ACCIDENTS.forEach(key => { summary.accidentCounts[key] = values[cursor++]; });
  ['driverArticles', 'plateArticles', 'speed', 'belt', 'alcohol'].forEach(key => { summary[key] = values[cursor++]; });
  return normalizedSummary(summary);
}

function checksum(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function decimalToBase36(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error('Ekip kodu yalnızca rakamlardan oluşmalıdır.');
  return BigInt(text).toString(36);
}

function base36ToDecimal(value) {
  if (!/^[0-9a-z]+$/i.test(value)) throw new Error('Ekip kodu geçersiz.');
  let result = 0n;
  for (const character of value.toLowerCase()) {
    result = result * 36n + BigInt(parseInt(character, 36));
  }
  return result.toString(10);
}

function base36Integer(value, label) {
  if (!/^[0-9a-z]+$/i.test(value)) throw new Error(`${label} geçersiz.`);
  return integer(parseInt(value, 36), label);
}

export function createTeamTransfer(evk) {
  let source = evk;
  if (evk?.dutyType === 'RADAR') {
    const payload = ensurePayload(evk);
    source = {
      ...evk,
      payload: {
        ...payload,
        controls: {},
        accidents: {},
        penalties: payload.penalties.filter(record => record?.origin === 'RADAR_OPERATOR' && record?.type === 'PLATE')
      }
    };
  }
  const report = summarizeDailyReport([source]);
  const summary = report.units[evk.sourceUnit];
  summary.teamCounts = Object.fromEntries(DUTIES.map(key => [key, key === evk.dutyType ? 1 : 0]));
  summary.teamTotal = 1;
  return normalizeTransfer({
    packetKind: TRANSFER_KINDS.TEAM,
    sourceUnit: evk.sourceUnit,
    teamCode: evk.teamCode,
    startEpochMillis: report.earliest,
    endEpochMillis: report.latest,
    summary,
    regularTeamCodes: ['GUNDUZ', 'GECE'].includes(evk.dutyType) ? [String(evk.teamCode)] : [],
    sourceRecordCount: 1
  });
}

export function aggregateTransfers(records, packetKind) {
  if (![TRANSFER_KINDS.DAY, TRANSFER_KINDS.UNIT].includes(packetKind)) throw new Error('Toplam türü geçersiz.');
  const combined = combineTransferSummaries(records);
  if (combined.sourceUnits.length !== 1) throw new Error('Farklı birimlerin icraatları aynı birim toplamına eklenemez.');
  return normalizeTransfer({
    packetKind,
    sourceUnit: combined.sourceUnits[0],
    teamCode: '',
    startEpochMillis: combined.startEpochMillis,
    endEpochMillis: combined.endEpochMillis,
    summary: combined.summary,
    regularTeamCodes: combined.regularTeamCodes,
    sourceRecordCount: combined.sourceRecordCount
  });
}

export function combineTransferSummaries(records) {
  if (!Array.isArray(records) || !records.length) throw new Error('Toplanacak icraat bulunamadı.');
  const normalized = records.map(normalizeTransfer);
  const result = emptySummary();
  const regularTeamKeys = new Set();
  let unidentifiedRegularTeams = 0;
  let sourceRecordCount = 0;
  for (const record of normalized) {
    const value = record.summary;
    const regularCount = add(value.teamCounts.GUNDUZ, value.teamCounts.GECE);
    record.regularTeamCodes.forEach(code => regularTeamKeys.add(`${record.sourceUnit}:${code}`));
    unidentifiedRegularTeams = add(unidentifiedRegularTeams, regularCount - record.regularTeamCodes.length);
    sourceRecordCount = add(sourceRecordCount, record.sourceRecordCount);
    result.teamCounts.ARA_EKIP = add(result.teamCounts.ARA_EKIP, value.teamCounts.ARA_EKIP);
    result.teamCounts.RADAR = add(result.teamCounts.RADAR, value.teamCounts.RADAR);
    CONTROLS.forEach(key => { result.controlCounts[key] = add(result.controlCounts[key], value.controlCounts[key]); });
    ACCIDENTS.forEach(key => { result.accidentCounts[key] = add(result.accidentCounts[key], value.accidentCounts[key]); });
    ['driverArticles', 'plateArticles', 'speed', 'belt', 'alcohol'].forEach(key => { result[key] = add(result[key], value[key]); });
  }
  result.teamCounts.GUNDUZ = add(regularTeamKeys.size, unidentifiedRegularTeams);
  result.teamCounts.GECE = 0;
  const sourceUnits = UNIT_CODES.filter(unit => normalized.some(record => record.sourceUnit === unit));
  return {
    sourceUnits,
    startEpochMillis: Math.min(...normalized.map(record => record.startEpochMillis)),
    endEpochMillis: Math.max(...normalized.map(record => record.endEpochMillis)),
    summary: normalizedSummary(result),
    sourceRecordCount,
    regularTeamCodes: sourceUnits.length === 1
      ? [...regularTeamKeys]
        .map(key => key.slice(key.indexOf(':') + 1))
        .sort((left, right) => left.localeCompare(right, 'tr-TR', { numeric: true }))
      : []
  };
}

export function normalizeTransfer(record) {
  if (!record || typeof record !== 'object') throw new Error('İcraat özeti geçersiz.');
  if (!Object.values(TRANSFER_KINDS).includes(record.packetKind)) throw new Error('İcraat özet türü geçersiz.');
  if (!UNIT_CODES.includes(record.sourceUnit)) throw new Error('İcraat birimi geçersiz.');
  const startEpochMillis = integer(record.startEpochMillis, 'Başlama zamanı');
  const endEpochMillis = integer(record.endEpochMillis, 'Bitiş zamanı');
  if (endEpochMillis <= startEpochMillis) throw new Error('İcraat zaman aralığı geçersiz.');
  const teamCode = record.packetKind === TRANSFER_KINDS.TEAM ? String(record.teamCode || '').trim() : '';
  if (record.packetKind === TRANSFER_KINDS.TEAM && !/^\d+$/.test(teamCode)) throw new Error('Ekip kodu geçersiz.');
  const summary = normalizedSummary(record.summary);
  const regularTeamCodes = normalizedRegularTeamCodes(record, record.packetKind, teamCode, summary);
  const sourceRecordCount = normalizedSourceRecordCount(record, record.packetKind, summary);
  return {
    recordType: 'ICRAAT_SUMMARY',
    packetKind: record.packetKind,
    sourceUnit: record.sourceUnit,
    teamCode,
    startEpochMillis,
    endEpochMillis,
    summary,
    regularTeamCodes,
    sourceRecordCount
  };
}

export function encodeTransfer(record) {
  const value = normalizeTransfer(record);
  const regularTeamCodes = value.regularTeamCodes.length
    ? value.regularTeamCodes.map(decimalToBase36).join('_')
    : '-';
  const fields = [
    VERSION.toString(36),
    value.packetKind,
    UNIT_CODES.indexOf(value.sourceUnit).toString(36),
    Math.floor(value.startEpochMillis / 60000).toString(36),
    Math.floor(value.endEpochMillis / 60000).toString(36),
    value.teamCode ? decimalToBase36(value.teamCode) : '-',
    regularTeamCodes,
    value.sourceRecordCount.toString(36),
    ...summaryToVector(value.summary).map(number => number.toString(36))
  ];
  const body = fields.join('.');
  return `${body}.${checksum(body)}`;
}

export function decodeTransfer(encoded) {
  const text = String(encoded || '').trim();
  const fields = text.split('.');
  const receivedChecksum = fields.pop();
  if (!receivedChecksum) throw new Error('Bağlantıdaki icraat özeti eksik.');
  const body = fields.join('.');
  if (checksum(body) !== receivedChecksum) throw new Error('Bağlantıdaki icraat özeti bozulmuş.');
  const version = base36Integer(fields[0], 'Sürüm');
  if (![1, 2, VERSION].includes(version)) throw new Error('Bu icraat bağlantısının sürümü desteklenmiyor.');
  const expectedLength = (version === 1 ? 6 : version === 2 ? 7 : 8) + TOTAL_FIELDS;
  if (fields.length !== expectedLength) throw new Error('Bağlantıdaki icraat özeti eksik.');
  const [versionField, packetKind, unitIndex, startMinute, endMinute, teamCode, ...remainder] = fields;
  void versionField;
  const regularCodesField = version === 1 ? null : remainder.shift();
  const sourceRecordCountField = version < 3 ? null : remainder.shift();
  const vector = remainder;
  const decodedTeamCode = teamCode === '-' ? '' : base36ToDecimal(teamCode);
  const regularTeamCodes = regularCodesField === null
    ? undefined
    : regularCodesField === '-'
      ? []
      : regularCodesField.split('_').map(base36ToDecimal);
  const record = normalizeTransfer({
    packetKind,
    sourceUnit: UNIT_CODES[base36Integer(unitIndex, 'Birim')],
    teamCode: decodedTeamCode,
    startEpochMillis: base36Integer(startMinute, 'Başlama zamanı') * 60000,
    endEpochMillis: base36Integer(endMinute, 'Bitiş zamanı') * 60000,
    summary: vectorToSummary(vector.map((value, index) => base36Integer(value, `Özet alanı ${index + 1}`))),
    ...(regularTeamCodes === undefined ? {} : { regularTeamCodes }),
    ...(sourceRecordCountField === null
      ? {}
      : { sourceRecordCount: base36Integer(sourceRecordCountField, 'Kaynak icraat sayısı') })
  });
  return { ...record, encoded: text, summaryId: `ozet-${checksum(text)}-${text.length}` };
}

export function storedTransfer(record, encoded = encodeTransfer(record)) {
  const decoded = decodeTransfer(encoded);
  return { ...decoded, receivedAt: Number(record?.receivedAt) || Date.now() };
}

export function toReportRecord(record) {
  const value = normalizeTransfer(record);
  return { ...value, summaryId: record.summaryId || '', receivedAt: record.receivedAt || 0 };
}

export function transferAction(records) {
  if (!records.length) return null;
  const kinds = new Set(records.map(record => record.packetKind));
  if (kinds.size === 1 && kinds.has(TRANSFER_KINDS.TEAM)) return TRANSFER_KINDS.DAY;
  if (!kinds.has(TRANSFER_KINDS.UNIT) && kinds.has(TRANSFER_KINDS.DAY)) return TRANSFER_KINDS.UNIT;
  if (kinds.size === 1 && kinds.has(TRANSFER_KINDS.UNIT)) return 'PDF';
  return 'INVALID';
}
