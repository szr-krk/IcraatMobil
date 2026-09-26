import { ensurePayload } from './domain.js';

export const REPORT_UNITS = ['MERKEZ', 'CORLU', 'MALKARA'];
export const REPORT_CONTROL_KEYS = ['K1_A', 'K2_A', 'K2_B', 'K4_A', 'K5', 'K6'];
export const REPORT_ACCIDENT_KEYS = ['fatalAccidentCount', 'deathCount', 'injuryAccidentCount', 'injuredCount'];

const REPORT_DUTIES = ['GUNDUZ', 'GECE', 'ARA_EKIP', 'RADAR'];
const LEGACY_CONTROL_KEYS = ['k1', 'k2A', 'k2B', 'k4', 'k5', 'k6'];
const TARGET_COLUMNS = ['C', 'G', 'K', 'O'];
const ACTUAL_COLUMNS = ['E', 'I', 'M', 'Q'];
const PERCENT_COLUMNS = ['F', 'J', 'N', 'R'];
const ACCIDENT_COLUMNS = ['F', 'J', 'N', 'R'];
const RADAR_OPERATOR_CODES = new Set(Array.from({ length: 9 }, (_, index) => `51/2-b-${index + 1}`));
const ISTANBUL_DATE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit'
});
const ISTANBUL_TIME_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false
});

function safeAdd(left, right, label = 'Rapor toplamı') {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error(`${label}: sayı sınırı aşıldı.`);
  return total;
}

function integerValue(value, label, { allowZero = true } = {}) {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label}: sıfır veya daha büyük bir tam sayı olmalı.`);
  const numeric = Number(text);
  if (!Number.isSafeInteger(numeric) || numeric < 0 || (!allowZero && numeric === 0)) {
    throw new Error(`${label}: sayı sınırı aşıldı.`);
  }
  return numeric;
}

function countFromSection(section, key, legacyKey, label) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) return 0;
  if (Object.hasOwn(section, key)) return integerValue(section[key], label);
  if (legacyKey && Object.hasOwn(section, legacyKey)) return integerValue(section[legacyKey], label);
  return 0;
}

function dateParts(epochMillis) {
  const parts = Object.fromEntries(ISTANBUL_DATE_PARTS.formatToParts(new Date(epochMillis))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formattedDate(parts) {
  return `${String(parts.day).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${parts.year}`;
}

function formattedTime(epochMillis) {
  const parts = Object.fromEntries(ISTANBUL_TIME_PARTS.formatToParts(new Date(epochMillis))
    .filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.hour}.${parts.minute}`;
}

function dayOfYear(parts) {
  return Math.floor((Date.UTC(parts.year, parts.month - 1, parts.day) - Date.UTC(parts.year, 0, 1)) / 86400000) + 1;
}

export function reportPeriodLabel(start, end) {
  if (dateKey(start) === dateKey(end)) return formattedDate(start);
  if (start.year === end.year && start.month === end.month) {
    return `${String(start.day).padStart(2, '0')}-${formattedDate(end)}`;
  }
  return `${formattedDate(start)} - ${formattedDate(end)}`;
}

function emptyUnitSummary() {
  return {
    teamCounts: Object.fromEntries(REPORT_DUTIES.map(duty => [duty, 0])),
    controlCounts: Object.fromEntries(REPORT_CONTROL_KEYS.map(key => [key, 0])),
    accidentCounts: Object.fromEntries(REPORT_ACCIDENT_KEYS.map(key => [key, 0])),
    driverArticles: 0,
    plateArticles: 0,
    speed: 0,
    belt: 0,
    alcohol: 0
  };
}

function validatePenalty(record, teamLabel) {
  if (!record || typeof record !== 'object') throw new Error(`${teamLabel}: geçersiz ceza kaydı.`);
  const count = integerValue(record.count, `${teamLabel} ceza adedi`, { allowZero: false });
  const parkingOnly = record.parkingOnly === true;
  const articles = Array.isArray(record.articles) ? record.articles : [];
  if (!parkingOnly && !articles.length) throw new Error(`${teamLabel}: ceza maddesi bulunamadı.`);
  for (const article of articles) {
    if (!String(article?.code || '').trim()) throw new Error(`${teamLabel}: ceza maddesi boş.`);
  }
  return { count, articles };
}

export function summarizeDailyReport(evks) {
  if (!Array.isArray(evks) || !evks.length) throw new Error('PDF için ekip kaydı bulunamadı.');
  const units = Object.fromEntries(REPORT_UNITS.map(unit => [unit, emptyUnitSummary()]));
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;

  for (const evk of evks) {
    const teamLabel = `Ekip ${evk?.teamCode || '?'}`;
    if (!Object.hasOwn(units, evk?.sourceUnit)) throw new Error(`${teamLabel}: bilinmeyen birim.`);
    const start = Number(evk.startEpochMillis ?? Date.parse(evk.startDateTime));
    const end = Number(evk.endEpochMillis ?? Date.parse(evk.endDateTime));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`${teamLabel}: geçersiz zaman aralığı.`);
    }
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);

    const unit = units[evk.sourceUnit];
    if (evk.recordType === 'ICRAAT_SUMMARY') {
      REPORT_DUTIES.forEach(key => {
        unit.teamCounts[key] = safeAdd(unit.teamCounts[key], integerValue(evk.summary?.teamCounts?.[key] ?? 0, `${teamLabel} ${key}`));
      });
      REPORT_CONTROL_KEYS.forEach(key => {
        unit.controlCounts[key] = safeAdd(unit.controlCounts[key], integerValue(evk.summary?.controlCounts?.[key] ?? 0, `${teamLabel} ${key}`));
      });
      REPORT_ACCIDENT_KEYS.forEach(key => {
        unit.accidentCounts[key] = safeAdd(unit.accidentCounts[key], integerValue(evk.summary?.accidentCounts?.[key] ?? 0, `${teamLabel} ${key}`));
      });
      ['driverArticles', 'plateArticles', 'speed', 'belt', 'alcohol'].forEach(key => {
        unit[key] = safeAdd(unit[key], integerValue(evk.summary?.[key] ?? 0, `${teamLabel} ${key}`));
      });
      continue;
    }
    if (!REPORT_DUTIES.includes(evk?.dutyType)) throw new Error(`${teamLabel}: bilinmeyen görev türü.`);
    unit.teamCounts[evk.dutyType] = safeAdd(unit.teamCounts[evk.dutyType], 1);
    const payload = ensurePayload(evk);
    REPORT_CONTROL_KEYS.forEach((key, index) => {
      const value = countFromSection(payload.controls, key, LEGACY_CONTROL_KEYS[index], `${teamLabel} ${key}`);
      unit.controlCounts[key] = safeAdd(unit.controlCounts[key], value);
    });
    REPORT_ACCIDENT_KEYS.forEach(key => {
      const value = countFromSection(payload.accidents, key, null, `${teamLabel} ${key}`);
      unit.accidentCounts[key] = safeAdd(unit.accidentCounts[key], value);
    });

    for (const record of payload.penalties) {
      if (evk.dutyType === 'RADAR'
          && !(record.origin === 'RADAR_OPERATOR' && record.type === 'PLATE')) continue;
      const { count, articles } = validatePenalty(record, teamLabel);
      for (const article of articles) {
        if (record.type === 'DRIVER') unit.driverArticles = safeAdd(unit.driverArticles, count);
        if (record.type === 'PLATE') unit.plateArticles = safeAdd(unit.plateArticles, count);
        const code = String(article.code).trim().toLocaleLowerCase('tr-TR');
        if (code === '78/1-a') unit.belt = safeAdd(unit.belt, count);
        if (RADAR_OPERATOR_CODES.has(code)) unit.speed = safeAdd(unit.speed, count);
        if (code.startsWith('48')) unit.alcohol = safeAdd(unit.alcohol, count);
      }
    }
  }

  Object.values(units).forEach(unit => {
    unit.teamTotal = Object.values(unit.teamCounts).reduce((total, value) => safeAdd(total, value), 0);
  });
  return { units, earliest, latest };
}

export function validateReferenceData(reference) {
  if (!reference || reference.app !== 'ICRAAT_REFERENCE' || reference.schemaVersion !== 2) {
    throw new Error('Geçersiz kontrol hedef dosyası.');
  }
  const updatedAt = String(reference.updatedAt || '').trim();
  const updatedAtEpochMillis = Date.parse(updatedAt);
  if (!updatedAt || !Number.isFinite(updatedAtEpochMillis)) throw new Error('Hedef dosyasının son güncelleme tarihi geçersiz.');
  const targets = reference.targets;
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new Error('Kontrol hedefleri bulunamadı.');
  REPORT_UNITS.forEach(unit => {
    if (!targets[unit]) throw new Error(`${unit} hedefleri bulunamadı.`);
    REPORT_CONTROL_KEYS.forEach(key => integerValue(targets[unit][key], `${unit} ${key} hedefi`));
  });
  return { targets, updatedAt, updatedAtEpochMillis };
}

export function validateAccidentCounts(accidents) {
  const result = {};
  REPORT_UNITS.forEach(unit => {
    const source = accidents?.[unit];
    const values = Array.isArray(source) ? source : REPORT_ACCIDENT_KEYS.map(key => source?.[key]);
    if (!Array.isArray(values) || values.length !== 4) throw new Error(`Kaza bilgileri eksik: ${unit}.`);
    result[unit] = values.map((value, index) => integerValue(value, `${unit} kaza alanı ${index + 1}`));
  });
  return result;
}

function validatePenaltySourceCounts(input) {
  const result = {};
  REPORT_UNITS.forEach(unit => {
    const source = input?.[unit];
    const kgysValue = Array.isArray(source) ? source[4] ?? 0 : source?.kgysPenaltyCount ?? 0;
    const ptsValue = Array.isArray(source) ? source[5] ?? 0 : source?.ptsPenaltyCount ?? 0;
    result[unit] = {
      kgys: integerValue(kgysValue, `${unit} KGYS ceza sayısı`),
      pts: integerValue(ptsValue, `${unit} PTS ceza sayısı`)
    };
  });
  return result;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? '-' : numerator / denominator;
}

function putControls(cells, index, targets, actuals) {
  let targetTotal = 0;
  let actualTotal = 0;
  for (let controlIndex = 0; controlIndex < 6; controlIndex += 1) {
    cells[`${TARGET_COLUMNS[index]}${45 + controlIndex}`] = targets[controlIndex];
    cells[`${ACTUAL_COLUMNS[index]}${45 + controlIndex}`] = actuals[controlIndex];
    targetTotal = safeAdd(targetTotal, targets[controlIndex]);
    actualTotal = safeAdd(actualTotal, actuals[controlIndex]);
  }
  cells[`${TARGET_COLUMNS[index]}51`] = targetTotal;
  cells[`${ACTUAL_COLUMNS[index]}51`] = actualTotal;
  cells[`${TARGET_COLUMNS[index]}53`] = ratio(actualTotal, targetTotal);
}

function putAccidents(cells, index, counts, endDate) {
  const column = ACCIDENT_COLUMNS[index];
  cells[`${column}64`] = `${endDate.year}\n(Bugüne Kadar)`;
  const elapsedDays = dayOfYear(endDate);
  counts.forEach((count, countIndex) => {
    cells[`${column}${65 + countIndex * 2}`] = count;
    cells[`${column}${66 + countIndex * 2}`] = count / elapsedDays;
  });
}

function putPenalties(cells, index, counts, period, year) {
  const actualColumn = ACTUAL_COLUMNS[index];
  const percentColumn = PERCENT_COLUMNS[index];
  const total = counts.reduce((sum, count) => safeAdd(sum, count), 0);
  counts.forEach((count, countIndex) => {
    cells[`${actualColumn}${84 + countIndex * 2}`] = count;
    cells[`${percentColumn}${84 + countIndex * 2}`] = ratio(count, total);
  });
  cells[`${actualColumn}92`] = total;
  cells[`${percentColumn}92`] = ratio(total, total);
  cells[`${actualColumn}82`] = year;
  cells[`${actualColumn}83`] = period;
}

export function buildDailyReportData(evks, accidentInput, reference) {
  const summary = summarizeDailyReport(evks);
  const accidents = validateAccidentCounts(accidentInput);
  const penaltySources = validatePenaltySourceCounts(accidentInput);
  const startDate = dateParts(summary.earliest);
  const endDate = dateParts(summary.latest);
  const periodLabel = reportPeriodLabel(startDate, endDate);
  const { targets: currentTargets } = validateReferenceData(reference);
  const cells = {
    F9: periodLabel,
    F11: `(${formattedTime(summary.earliest)}-${formattedTime(summary.latest)})`
  };
  const totalTeams = [0, 0, 0, 0];
  const totalTargets = [0, 0, 0, 0, 0, 0];
  const totalActuals = [0, 0, 0, 0, 0, 0];
  const totalAccidents = [0, 0, 0, 0];
  const totalPenalties = [0, 0, 0, 0];
  const totalArticles = [0, 0, 0];

  REPORT_UNITS.forEach((unitCode, unitIndex) => {
    const unit = summary.units[unitCode];
    const teams = [
      safeAdd(unit.teamCounts.GUNDUZ, unit.teamCounts.GECE),
      unit.teamCounts.ARA_EKIP,
      unit.teamCounts.RADAR,
      unit.teamTotal
    ];
    [23, 26, 29, 32].forEach((row, index) => {
      cells[`${TARGET_COLUMNS[unitIndex]}${row}`] = teams[index];
      totalTeams[index] = safeAdd(totalTeams[index], teams[index]);
    });
    const targets = REPORT_CONTROL_KEYS.map(key => integerValue(currentTargets[unitCode][key], `${unitCode} ${key} hedefi`));
    const actuals = REPORT_CONTROL_KEYS.map(key => unit.controlCounts[key]);
    targets.forEach((value, index) => { totalTargets[index] = safeAdd(totalTargets[index], value); });
    actuals.forEach((value, index) => { totalActuals[index] = safeAdd(totalActuals[index], value); });
    putControls(cells, unitIndex, targets, actuals);

    accidents[unitCode].forEach((value, index) => {
      totalAccidents[index] = safeAdd(totalAccidents[index], value);
    });
    putAccidents(cells, unitIndex, accidents[unitCode], endDate);

    const penalties = [
      unit.driverArticles,
      unit.plateArticles,
      penaltySources[unitCode].pts,
      penaltySources[unitCode].kgys
    ];
    const articles = [unit.speed, unit.belt, unit.alcohol];
    putPenalties(cells, unitIndex, penalties, periodLabel, endDate.year);
    penalties.forEach((value, index) => { totalPenalties[index] = safeAdd(totalPenalties[index], value); });
    articles.forEach((value, index) => {
      totalArticles[index] = safeAdd(totalArticles[index], value);
      cells[`${ACTUAL_COLUMNS[unitIndex]}${104 + index}`] = value;
    });
    cells[`${ACTUAL_COLUMNS[unitIndex]}103`] = periodLabel;
  });

  [23, 26, 29, 32].forEach((row, index) => { cells[`O${row}`] = totalTeams[index]; });
  putControls(cells, 3, totalTargets, totalActuals);
  putAccidents(cells, 3, totalAccidents, endDate);
  putPenalties(cells, 3, totalPenalties, periodLabel, endDate.year);
  totalArticles.forEach((value, index) => { cells[`Q${104 + index}`] = value; });
  cells.Q103 = periodLabel;

  return { cells, periodLabel, startDate, endDate, summary };
}
