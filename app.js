import {
  deleteAllEvks, deleteEvk, evkIdExists, getAllEvks, getEvk, getSetting, openDatabase,
  putEvk, putManyEvks, setSetting, updateEvk
} from './db.js';
import {
  ACCIDENT_FIELDS, CONTROLS, UNITS, buildEnvelope, buildJsonFileName, buildPerformanceReport, buildSharePerformanceText, calculateKeyboardInset, compareIncoming,
  directoryItemKey, displayDateTime, dutyLabel, ensurePayload, makeChildId, makeRandomId,
  mergeDirectoryItems, penaltySummary, sameLogicalShift, sortPersonnelByRegistry,
  toIstanbulIso, unitLabel, validateEnvelope
} from './domain.js';
import { createDailyReportPdf } from './pdf-report.js';
import { summarizeDailyReport } from './report.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  evks: [],
  selectedEvkId: null,
  editingEvkId: null,
  cardActionId: null,
  draftPersonnel: [],
  draftRoads: [],
  personnelDirectory: [],
  roadDirectory: [],
  directoriesLoaded: false,
  editingOfficerId: null,
  editingRoadId: null,
  selectedArticles: [],
  guide: [],
  reportFile: null,
  saveTimers: new Map(),
  pendingDetailInputs: new Set()
};

const listScreen = $('#listScreen');
const detailScreen = $('#detailScreen');
const teamList = $('#teamList');
const teamDialog = $('#teamDialog');
const teamForm = $('#teamForm');
const overflowMenu = $('#overflowMenu');
const menuBackdrop = $('#menuBackdrop');
const cardMenuDialog = $('#cardMenuDialog');
const articleSearch = $('#articleSearch');
const articleResults = $('#articleResults');
const RADAR_ARTICLE_CODES = Array.from({ length: 9 }, (_, index) => `51/2-b-${index + 1}`);
const REPORT_INPUT_FIELDS = [
  ...ACCIDENT_FIELDS.map(field => [...field, true]),
  ['kgysPenaltyCount', 'KGYS Ceza Sayısı', true],
  ['ptsPenaltyCount', 'PTS Ceza Sayısı', true]
];
const REPORT_INPUTS_SETTING = 'daily_report_inputs_v1';

let toastTimer;
let largestVisualViewportHeight = window.visualViewport?.height || window.innerHeight;
let focusedCountScrollTimer;
let reportInputSaveTimer;

function showToast(message, duration = 2400) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, duration);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function toggleMenu(force) {
  const next = force ?? overflowMenu.hidden;
  overflowMenu.hidden = !next;
  menuBackdrop.hidden = !next;
  $('#menuButton').setAttribute('aria-expanded', String(next));
}

async function refreshEvks() {
  state.evks = await getAllEvks();
  if (!state.directoriesLoaded) await loadDirectories();
  renderTeamList();
  if (state.selectedEvkId) {
    const current = state.evks.find(item => item.evkId === state.selectedEvkId);
    if (current) renderDetail(current);
    else showListView();
  }
}

function sortedEvks() {
  const unitOrder = new Map(UNITS.map((unit, index) => [unit.code, index]));
  return [...state.evks].sort((left, right) => {
    const unitDifference = (unitOrder.get(left.sourceUnit) ?? 99) - (unitOrder.get(right.sourceUnit) ?? 99);
    return unitDifference || right.startEpochMillis - left.startEpochMillis;
  });
}

function renderTeamList() {
  const sorted = sortedEvks();
  const unitCounts = Object.fromEntries(UNITS.map(unit => [unit.code, 0]));
  sorted.forEach(evk => { unitCounts[evk.sourceUnit] = (unitCounts[evk.sourceUnit] || 0) + 1; });
  $('#merkezCount').textContent = String(unitCounts.MERKEZ);
  $('#corluCount').textContent = String(unitCounts.CORLU);
  $('#malkaraCount').textContent = String(unitCounts.MALKARA);

  if (!sorted.length) {
    teamList.innerHTML = `<div class="empty-state">
      <div class="empty-mark" aria-hidden="true"><img src="./assets/ekip.svg" alt=""></div>
      <h2>Henüz ekip kaydı yok</h2>
      <p>İlk vardiya kaydını oluşturmak için artı düğmesine dokunun.</p>
    </div>`;
    return;
  }

  teamList.innerHTML = UNITS.map(unit => {
    const records = sorted.filter(evk => evk.sourceUnit === unit.code);
    if (!records.length) return '';
    return `<section class="unit-section">
      <div class="unit-heading"><h2>${escapeHtml(unit.label)}</h2><span>${records.length}</span></div>
      <div class="card-stack">${records.map(teamCardHtml).join('')}</div>
    </section>`;
  }).join('');

  $$('.team-card').forEach(card => bindCardGestures(card));
}

function withDirectoryIds(items, prefix) {
  return items.map(item => ({ ...item, id: item.id || makeChildId(prefix) }));
}

async function loadDirectories() {
  const existingPersonnel = await getSetting('personnel_directory', null);
  const existingRoads = await getSetting('road_directory', null);
  const evkPersonnel = state.evks.flatMap(evk => ensurePayload(evk).personnel);
  const evkRoads = state.evks.flatMap(evk => ensurePayload(evk).roads);
  state.personnelDirectory = sortPersonnelByRegistry(withDirectoryIds(
    existingPersonnel === null
      ? mergeDirectoryItems([], evkPersonnel, 'personnel')
      : (Array.isArray(existingPersonnel) ? existingPersonnel : []),
    'person'
  ));
  state.roadDirectory = withDirectoryIds(
    existingRoads === null
      ? mergeDirectoryItems([], evkRoads, 'roads')
      : (Array.isArray(existingRoads) ? existingRoads : []),
    'road'
  );
  if (existingPersonnel === null) await setSetting('personnel_directory', state.personnelDirectory);
  if (existingRoads === null) await setSetting('road_directory', state.roadDirectory);
  state.directoriesLoaded = true;
}

async function absorbDirectoriesFromEvks(evks) {
  state.personnelDirectory = sortPersonnelByRegistry(withDirectoryIds(mergeDirectoryItems(
    state.personnelDirectory,
    evks.flatMap(evk => ensurePayload(evk).personnel),
    'personnel'
  ), 'person'));
  state.roadDirectory = withDirectoryIds(mergeDirectoryItems(
    state.roadDirectory,
    evks.flatMap(evk => ensurePayload(evk).roads),
    'roads'
  ), 'road');
  await Promise.all([
    setSetting('personnel_directory', state.personnelDirectory),
    setSetting('road_directory', state.roadDirectory)
  ]);
}

function directorySelectionContains(item, type) {
  const selected = type === 'personnel' ? state.draftPersonnel : state.draftRoads;
  const key = directoryItemKey(item, type);
  return selected.some(value => directoryItemKey(value, type) === key);
}

function renderOfficerDirectory() {
  const list = $('#savedOfficerList');
  if (!state.personnelDirectory.length) {
    list.innerHTML = '<div class="directory-empty">Henüz kayıtlı görevli yok. “Yeni” düğmesiyle ilk kaydı oluşturun.</div>';
    return;
  }
  list.innerHTML = sortPersonnelByRegistry(state.personnelDirectory).map(person => {
    const selected = directorySelectionContains(person, 'personnel');
    const name = `${person.ad || ''} ${person.soyad || ''}`.trim();
    return `<div class="directory-row ${selected ? 'selected' : ''}">
      <button type="button" class="directory-select" data-toggle-officer="${escapeHtml(person.id)}" aria-pressed="${selected}">
        <span class="directory-check">${selected ? '✓' : '+'}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(person.sicil || 'Sicil belirtilmedi')}</small></span>
      </button>
      <button type="button" class="directory-icon" data-edit-officer="${escapeHtml(person.id)}" aria-label="Görevliyi güncelle">✎</button>
      <button type="button" class="directory-icon danger-text" data-delete-officer="${escapeHtml(person.id)}" aria-label="Görevliyi sil">×</button>
    </div>`;
  }).join('');
}

function renderRoadDirectory() {
  const list = $('#savedRoadList');
  if (!state.roadDirectory.length) {
    list.innerHTML = '<div class="directory-empty">Henüz kayıtlı yol yok. “Yeni” düğmesiyle ilk kaydı oluşturun.</div>';
    return;
  }
  list.innerHTML = state.roadDirectory.map(road => {
    const selected = directorySelectionContains(road, 'roads');
    return `<div class="directory-row ${selected ? 'selected' : ''}">
      <button type="button" class="directory-select" data-toggle-road="${escapeHtml(road.id)}" aria-pressed="${selected}">
        <span class="directory-check">${selected ? '✓' : '+'}</span><span><strong>${escapeHtml(road.yolad)}</strong><small>${selected ? 'Ekibe eklendi' : 'Ekibe eklemek için dokunun'}</small></span>
      </button>
      <button type="button" class="directory-icon" data-edit-road="${escapeHtml(road.id)}" aria-label="Yolu güncelle">✎</button>
      <button type="button" class="directory-icon danger-text" data-delete-road="${escapeHtml(road.id)}" aria-label="Yolu sil">×</button>
    </div>`;
  }).join('');
}

function showOfficerEditor(id = null) {
  state.editingOfficerId = id;
  const person = state.personnelDirectory.find(item => item.id === id);
  $('#officerForm').reset();
  $('#officerEditorTitle').textContent = person ? 'Görevliyi Güncelle' : 'Yeni Görevli';
  $('#officerRegistry').value = person?.sicil || '';
  $('#officerName').value = person?.ad || '';
  $('#officerSurname').value = String(person?.soyad || '').toLocaleUpperCase('tr-TR');
  if ($('#officerDialog').open) $('#officerDialog').close();
  $('#officerEditorDialog').showModal();
}

function showRoadEditor(id = null) {
  state.editingRoadId = id;
  const road = state.roadDirectory.find(item => item.id === id);
  $('#roadForm').reset();
  $('#roadEditorTitle').textContent = road ? 'Yolu Güncelle' : 'Yeni Yol';
  $('#roadName').value = road?.yolad || '';
  if ($('#roadDialog').open) $('#roadDialog').close();
  $('#roadEditorDialog').showModal();
}

function returnToOfficerDirectory() {
  if ($('#officerEditorDialog').open) $('#officerEditorDialog').close();
  renderOfficerDirectory();
  if (!$('#officerDialog').open) $('#officerDialog').showModal();
}

function returnToRoadDirectory() {
  if ($('#roadEditorDialog').open) $('#roadEditorDialog').close();
  renderRoadDirectory();
  if (!$('#roadDialog').open) $('#roadDialog').showModal();
}

function toggleDirectorySelection(item, type) {
  const target = type === 'personnel' ? 'draftPersonnel' : 'draftRoads';
  const key = directoryItemKey(item, type);
  const index = state[target].findIndex(value => directoryItemKey(value, type) === key);
  if (index >= 0) state[target].splice(index, 1);
  else state[target].push(structuredClone(item));
  renderTeamDraftLists();
  if (type === 'personnel') renderOfficerDirectory(); else renderRoadDirectory();
}

function teamCardHtml(evk) {
  return `<div class="swipe-shell">
    <span class="swipe-label edit">GÜNCELLE</span>
    <span class="swipe-label delete">SİL</span>
    <article class="team-card" data-id="${escapeHtml(evk.evkId)}" tabindex="0" aria-label="${escapeHtml(evk.teamCode)} numaralı ekip">
      <div class="team-icon" aria-hidden="true"><img src="./assets/ekip.svg" alt=""></div>
      <div class="team-code"><strong>${escapeHtml(evk.teamCode)}</strong><span>(${escapeHtml(dutyLabel(evk.dutyType))})</span></div>
      <div class="team-meta"><strong>${escapeHtml(unitLabel(evk.sourceUnit))}</strong><span>${escapeHtml(displayDateTime(evk.startEpochMillis))}</span><span>${escapeHtml(displayDateTime(evk.endEpochMillis))}</span></div>
    </article>
  </div>`;
}

function bindCardGestures(card) {
  const id = card.dataset.id;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let longPressed = false;
  let longPressTimer;

  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(id);
    }
    if (event.key === 'ContextMenu') openCardMenu(id);
  });

  card.addEventListener('contextmenu', event => {
    event.preventDefault();
    openCardMenu(id);
  });

  card.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    startX = event.clientX;
    startY = event.clientY;
    offsetX = 0;
    longPressed = false;
    card.setPointerCapture?.(event.pointerId);
    longPressTimer = setTimeout(() => {
      longPressed = true;
      navigator.vibrate?.(25);
      resetCardPosition(card);
      openCardMenu(id);
    }, 560);
  });

  card.addEventListener('pointermove', event => {
    if (!card.hasPointerCapture?.(event.pointerId)) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
      clearTimeout(longPressTimer);
      return;
    }
    if (Math.abs(deltaX) > 8) clearTimeout(longPressTimer);
    offsetX = Math.max(-105, Math.min(105, deltaX));
    card.style.transform = `translateX(${offsetX}px)`;
  });

  const finishGesture = () => {
    clearTimeout(longPressTimer);
    if (longPressed) return;
    const actionOffset = offsetX;
    resetCardPosition(card);
    if (actionOffset >= 72) openTeamDialog(id);
    else if (actionOffset <= -72) requestDeleteEvk(id);
    else if (Math.abs(actionOffset) < 8) openDetail(id);
  };
  card.addEventListener('pointerup', finishGesture);
  card.addEventListener('pointercancel', () => {
    clearTimeout(longPressTimer);
    resetCardPosition(card);
  });
}

function resetCardPosition(card) {
  card.style.transform = 'translateX(0)';
}

function openCardMenu(id) {
  state.cardActionId = id;
  const evk = state.evks.find(item => item.evkId === id);
  $('#cardMenuTitle').textContent = evk ? `Ekip ${evk.teamCode}` : 'Ekip işlemleri';
  if (!cardMenuDialog.open) cardMenuDialog.showModal();
}

function renderTeamDraftLists() {
  state.draftPersonnel = sortPersonnelByRegistry(state.draftPersonnel);
  $('#officerList').innerHTML = state.draftPersonnel.map(person => `<span class="data-chip">
    ${escapeHtml(`${person.ad} ${person.soyad}`.trim())}${person.sicil ? ` · ${escapeHtml(person.sicil)}` : ''}
    <button type="button" data-remove-officer="${escapeHtml(person.id)}" aria-label="Görevliyi kaldır">×</button>
  </span>`).join('');
  $('#roadList').innerHTML = state.draftRoads.map(road => `<span class="data-chip">
    ${escapeHtml(road.yolad)}<button type="button" data-remove-road="${escapeHtml(road.id)}" aria-label="Yolu kaldır">×</button>
  </span>`).join('');
  $('#officerEmpty').hidden = state.draftPersonnel.length > 0;
  $('#roadEmpty').hidden = state.draftRoads.length > 0;
}

async function openTeamDialog(id = null) {
  state.editingEvkId = id;
  state.draftPersonnel = [];
  state.draftRoads = [];
  teamForm.reset();
  $('#teamDialogTitle').textContent = id ? 'Ekip Güncelle' : 'Ekip Ekle';
  $('#saveTeamButton').textContent = id ? 'GÜNCELLE' : 'KAYDET';

  if (id) {
    const evk = state.evks.find(item => item.evkId === id) || await getEvk(id);
    if (!evk) return;
    const payload = ensurePayload(evk);
    $('#teamUnit').value = evk.sourceUnit;
    $('#teamCode').value = evk.teamCode;
    const dutyInput = teamForm.querySelector(`[name="dutyType"][value="${evk.dutyType}"]`);
    if (dutyInput) dutyInput.checked = true;
    const [startDate, startTimePart] = evk.startDateTime.split('T');
    const [endDate, endTimePart] = evk.endDateTime.split('T');
    $('#startDate').value = startDate;
    $('#startTime').value = startTimePart.slice(0, 5);
    $('#endDate').value = endDate;
    $('#endTime').value = endTimePart.slice(0, 5);
    state.draftPersonnel = structuredClone(payload.personnel);
    state.draftRoads = structuredClone(payload.roads);
  } else {
    $('#teamUnit').value = await getSetting('last_selected_unit', 'MERKEZ');
    teamForm.querySelector('[name="dutyType"][value="GUNDUZ"]').checked = true;
  }

  teamForm.querySelectorAll('[name="dutyType"]').forEach(input => { input.disabled = Boolean(id); });
  renderTeamDraftLists();
  teamDialog.showModal();
}

async function saveTeam(event) {
  event.preventDefault();
  if (!teamForm.reportValidity()) return;
  const teamCode = $('#teamCode').value.trim();
  if (!/^\d+$/.test(teamCode)) {
    showToast('Ekip kodu yalnızca rakamlardan oluşmalıdır.');
    $('#teamCode').focus();
    return;
  }
  const startDateTime = toIstanbulIso($('#startDate').value, $('#startTime').value);
  const endDateTime = toIstanbulIso($('#endDate').value, $('#endTime').value);
  const startEpochMillis = Date.parse(startDateTime);
  const endEpochMillis = Date.parse(endDateTime);
  if (endEpochMillis <= startEpochMillis) {
    showToast('Bitiş zamanı başlangıçtan sonra olmalıdır.');
    $('#endTime').focus();
    return;
  }

  const now = Date.now();
  const existing = state.editingEvkId ? state.evks.find(item => item.evkId === state.editingEvkId) : null;
  const dutyType = existing?.dutyType || teamForm.querySelector('[name="dutyType"]:checked').value;
  const sourceUnit = $('#teamUnit').value;
  const duplicate = state.evks.find(item => item.evkId !== state.editingEvkId
    && item.sourceUnit === sourceUnit && item.teamCode === teamCode
    && item.startDateTime === startDateTime && item.endDateTime === endDateTime);
  if (duplicate) {
    const proceed = await askConfirm(
      'Benzer ekip kaydı bulundu',
      'Aynı birim, ekip kodu, başlangıç ve bitiş zamanına sahip başka bir icraat var. Yine de kaydedilsin mi?',
      'Yine de Kaydet'
    );
    if (!proceed) return;
  }

  let evkId = existing?.evkId;
  if (!evkId) {
    do { evkId = makeRandomId(); } while (await evkIdExists(evkId));
  }
  const payload = existing ? ensurePayload(existing) : ensurePayload({});
  payload.personnel = structuredClone(sortPersonnelByRegistry(state.draftPersonnel));
  payload.roads = structuredClone(state.draftRoads);
  const value = {
    ...(existing || {}),
    recordType: 'EVK',
    evkId,
    revision: existing?.revision ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sourceUnit,
    reportPeriod: $('#startDate').value,
    teamCode,
    dutyType,
    startDateTime,
    endDateTime,
    startEpochMillis,
    endEpochMillis,
    payload
  };
  await putEvk(value);
  await setSetting('last_selected_unit', sourceUnit);
  teamDialog.close();
  await refreshEvks();
  showToast(existing ? 'Ekip güncellendi.' : 'Ekip kaydedildi.');
}

function showListView() {
  state.selectedEvkId = null;
  listScreen.hidden = false;
  detailScreen.hidden = true;
  $('#addTeamButton').hidden = false;
  $('#backButton').hidden = true;
  $('#pageTitle').textContent = 'Ekipler';
  $('#pageEyebrow').textContent = 'BÖLGE TRAFİK';
  document.title = 'İcraat';
}

function openDetail(id, pushHistory = true) {
  const evk = state.evks.find(item => item.evkId === id);
  if (!evk) return;
  resetPenaltyForm();
  state.selectedEvkId = id;
  listScreen.hidden = true;
  detailScreen.hidden = false;
  $('#addTeamButton').hidden = true;
  $('#backButton').hidden = false;
  $('#pageTitle').textContent = `Ekip ${evk.teamCode}`;
  $('#pageEyebrow').textContent = unitLabel(evk.sourceUnit).toLocaleUpperCase('tr-TR');
  document.title = `Ekip ${evk.teamCode} · İcraat`;
  renderDetail(evk);
  selectTab(evk.dutyType === 'RADAR' ? 'radarTeam' : 'penalties');
  if (pushHistory) history.pushState({ evkId: id }, '', `#evk=${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0 });
}

function renderDetail(evk) {
  const payload = ensurePayload(evk);
  $('#detailSummary').innerHTML = `<span><strong>${escapeHtml(dutyLabel(evk.dutyType))}</strong> · ${escapeHtml(unitLabel(evk.sourceUnit))}</span><span>${escapeHtml(displayDateTime(evk.startEpochMillis))}</span>`;
  const radar = evk.dutyType === 'RADAR';
  configureDetailTabs(radar);
  renderPenaltyList(payload.penalties.filter(record => !String(record.origin || '').startsWith('RADAR_')));
  renderRadarCounts(payload.penalties, 'RADAR_TEAM', '#radarTeamGrid');
  renderRadarCounts(payload.penalties, 'RADAR_OPERATOR', '#radarOperatorGrid');
  renderControls(payload.controls);
  renderAccidents(payload.accidents);
  renderPerformance(evk);
}

function configureDetailTabs(radar) {
  const normalTabs = ['penalties', 'controls', 'accidents'];
  const radarTabs = ['radarTeam', 'radarOperator'];
  normalTabs.forEach(name => { $(`[data-tab="${name}"]`).hidden = radar; });
  radarTabs.forEach(name => { $(`[data-tab="${name}"]`).hidden = !radar; });
  $('[data-tab="performance"]').hidden = false;
  $('.tabs').classList.toggle('radar-tabs', radar);
}

async function selectTab(name) {
  $$('.tabs [role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
  const names = ['penalties', 'radarTeam', 'radarOperator', 'controls', 'accidents', 'performance'];
  names.forEach(value => { $(`#${value}Panel`).hidden = value !== name; });
  if (name === 'penalties') requestAnimationFrame(updatePenaltyComposerMetrics);
  if (name === 'radarTeam' || name === 'radarOperator') clearUnexpectedRadarFocus();
  if (name === 'performance') {
    const evkId = state.selectedEvkId;
    await flushPendingDetailInputs(evkId);
    const updated = evkId ? await getEvk(evkId) : null;
    if (!updated || state.selectedEvkId !== evkId || $('#performancePanel').hidden) return;
    const index = state.evks.findIndex(item => item.evkId === evkId);
    if (index >= 0) state.evks[index] = updated;
    renderPerformance(updated);
  }
}

function clearUnexpectedRadarFocus() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (document.activeElement?.matches('[data-radar-code]')) document.activeElement.blur();
  }));
}

function radarGuideArticles() {
  return RADAR_ARTICLE_CODES.map(code => state.guide.find(article => article.code.trim().toLocaleLowerCase('tr-TR') === code.toLocaleLowerCase('tr-TR')) || {
    code,
    amount: 0,
    year: new Date().getFullYear(),
    description: 'Radar hız ihlali'
  });
}

function radarCountsForOrigin(records, origin) {
  const counts = Object.fromEntries(RADAR_ARTICLE_CODES.map(code => [code, 0]));
  records.filter(record => record.origin === origin).forEach(record => {
    const count = Number.parseInt(record.count, 10);
    if (!Number.isInteger(count) || count < 1) return;
    (record.articles || []).forEach(article => {
      const code = RADAR_ARTICLE_CODES.find(value => value.toLocaleLowerCase('tr-TR') === String(article.code || '').trim().toLocaleLowerCase('tr-TR'));
      if (code) counts[code] += count;
    });
  });
  return counts;
}

function renderRadarCounts(records, origin, selector) {
  const counts = radarCountsForOrigin(records, origin);
  $(selector).innerHTML = radarGuideArticles().map(article => {
    const value = counts[article.code] || '';
    return `<label class="radar-count-field">
      <strong>${escapeHtml(article.code)}</strong>
      <input type="number" min="0" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-radar-origin="${escapeHtml(origin)}" data-radar-code="${escapeHtml(article.code)}" value="${escapeHtml(value)}" aria-label="${escapeHtml(article.code)} ceza adedi">
    </label>`;
  }).join('');
}

function renderPenaltyList(records) {
  const container = $('#penaltyList');
  if (!records.length) {
    container.innerHTML = '<div class="penalty-empty">Bu icraat için henüz ceza kaydı yok.</div>';
    return;
  }
  container.innerHTML = records.map(record => {
    const summary = penaltySummary(record);
    return `<div class="penalty-swipe-shell">
      <span class="penalty-swipe-label left" aria-hidden="true">SİL</span><span class="penalty-swipe-label right" aria-hidden="true">SİL</span>
      <article class="penalty-card" data-penalty-id="${escapeHtml(record.penaltyId)}" aria-label="${escapeHtml(summary)}">
        <p>${escapeHtml(summary)}</p>
        <div class="penalty-card-actions"><button type="button" data-edit-penalty="${escapeHtml(record.penaltyId)}" aria-label="Adedi düzenle">#</button></div>
      </article>
    </div>`;
  }).join('');
  container.querySelectorAll('.penalty-card').forEach(card => bindPenaltySwipe(card));
}

function bindPenaltySwipe(card) {
  const penaltyId = card.dataset.penaltyId;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let swiping = false;

  card.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    startX = event.clientX;
    startY = event.clientY;
    offsetX = 0;
    swiping = false;
    card.style.transition = 'none';
    card.setPointerCapture?.(event.pointerId);
  });
  card.addEventListener('pointermove', event => {
    if (!card.hasPointerCapture?.(event.pointerId)) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!swiping && Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) > 7) swiping = true;
    if (!swiping) return;
    offsetX = Math.max(-110, Math.min(110, deltaX));
    card.style.transform = `translateX(${offsetX}px)`;
  });
  const finish = () => {
    const shouldDelete = swiping && Math.abs(offsetX) >= 68;
    card.style.transition = '';
    card.style.transform = 'translateX(0)';
    offsetX = 0;
    swiping = false;
    if (shouldDelete) deletePenalty(penaltyId);
  };
  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', () => {
    card.style.transition = '';
    card.style.transform = 'translateX(0)';
    offsetX = 0;
    swiping = false;
  });
}

function renderSelectedArticles() {
  $('#selectedArticles').innerHTML = state.selectedArticles.map((article, index) => `<span class="article-chip">${escapeHtml(article.code)}<button type="button" data-remove-article="${index}" aria-label="Maddeyi kaldır">×</button></span>`).join('');
}

function availableGuide() {
  return state.guide;
}

function renderArticleResults(query) {
  const normalized = query.trim().toLocaleLowerCase('tr-TR');
  if (!normalized) {
    articleResults.hidden = true;
    articleResults.innerHTML = '';
    $('#penaltyForm').classList.remove('search-active');
    return;
  }
  const matches = availableGuide().filter(article =>
    article.code.toLocaleLowerCase('tr-TR').includes(normalized)
    || article.description.toLocaleLowerCase('tr-TR').includes(normalized)
  ).slice(0, 30);
  articleResults.innerHTML = matches.length ? matches.map((article, index) => `<button type="button" class="article-result" data-guide-index="${index}"><strong>${escapeHtml(article.code)}</strong><span>${escapeHtml(article.description)} · ${escapeHtml(article.amount)} TL</span></button>`).join('') : '<div class="penalty-empty">Eşleşen madde bulunamadı.</div>';
  articleResults.dataset.resultCodes = JSON.stringify(matches.map(article => article.code));
  articleResults.hidden = false;
  $('#penaltyForm').classList.add('search-active');
}

async function savePenalty(event) {
  event.preventDefault();
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
  if (!evk) return;
  const count = Number.parseInt($('#penaltyCount').value, 10);
  if (!Number.isInteger(count) || count < 1) {
    showToast('Ceza adedi en az 1 olmalıdır.');
    return;
  }
  const parkingOnly = state.selectedArticles.length === 0 && $('#parking').checked;
  if (!state.selectedArticles.length && !parkingOnly) {
    showToast('En az bir ceza maddesi seçin.');
    return;
  }
  const origin = 'NORMAL';
  const type = parkingOnly ? null : document.querySelector('[name="penaltyType"]:checked').value;
  const record = {
    penaltyId: makeChildId('penalty'),
    type,
    articles: structuredClone(state.selectedArticles),
    vehicleBan: $('#vehicleBan').checked,
    parking: $('#parking').checked,
    licenseCancel: $('#licenseCancel').checked,
    count,
    parkingOnly,
    origin
  };
  await updateEvk(evk.evkId, current => {
    const payload = ensurePayload(current);
    payload.penalties.unshift(record);
    return { ...current, payload, updatedAt: Date.now() };
  });
  resetPenaltyForm();
  await refreshEvks();
  showToast('Ceza kaydedildi.');
}

function resetPenaltyForm() {
  state.selectedArticles = [];
  $('#penaltyCount').value = '1';
  $('#vehicleBan').checked = false;
  $('#parking').checked = false;
  $('#licenseCancel').checked = false;
  articleSearch.value = '';
  articleResults.hidden = true;
  $('#penaltyForm').classList.remove('search-active');
  renderSelectedArticles();
}

function selectPenaltyCount() {
  const input = $('#penaltyCount');
  requestAnimationFrame(() => input.select());
}

function updatePenaltyComposerMetrics() {
  const composer = $('#penaltyForm');
  const height = composer && !composer.closest('[hidden]') ? Math.ceil(composer.getBoundingClientRect().height) : 0;
  if (height) document.documentElement.style.setProperty('--composer-height', `${height}px`);
  const viewport = window.visualViewport;
  if (!viewport) return;
  const visualHeight = Math.round(viewport.height);
  largestVisualViewportHeight = Math.max(largestVisualViewportHeight, visualHeight);
  const overlayInset = viewport
    ? calculateKeyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)
    : 0;
  const resizedInset = Math.max(0, Math.round(largestVisualViewportHeight - viewport.height));
  const keyboardHeight = Math.max(overlayInset, resizedInset);
  document.documentElement.style.setProperty('--keyboard-inset', `${overlayInset}px`);
  document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
  document.documentElement.style.setProperty('--visual-height', `${visualHeight}px`);
  document.documentElement.classList.toggle('keyboard-open', keyboardHeight > 120);
}

function keepArticleSearchFocused(event) {
  if (document.activeElement !== articleSearch) return;
  const control = event.target.closest(
    '.type-scroll label, .check-row label, .clear-button, .article-chip button, .article-result'
  );
  if (control) event.preventDefault();
}

function scheduleFocusedCountVisibility() {
  clearTimeout(focusedCountScrollTimer);
  focusedCountScrollTimer = setTimeout(() => {
    const input = document.activeElement;
    if (!input?.matches('[data-count-section], [data-radar-code]')) return;
    input.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  }, 180);
}

function scheduleRadarCountSave(input) {
  const evkId = state.selectedEvkId;
  const timerKey = detailInputTimerKey(input, evkId);
  clearTimeout(state.saveTimers.get(timerKey));
  input.dataset.pendingEvkId = evkId || '';
  state.pendingDetailInputs.add(input);
  const timer = setTimeout(async () => {
    try {
      await saveRadarCount(input, evkId);
    } finally {
      if (state.saveTimers.get(timerKey) === timer) state.saveTimers.delete(timerKey);
      state.pendingDetailInputs.delete(input);
      delete input.dataset.pendingEvkId;
    }
  }, 280);
  state.saveTimers.set(timerKey, timer);
}

async function saveRadarCount(input, evkId) {
  const origin = input.dataset.radarOrigin;
  const code = input.dataset.radarCode;
  if (!evkId || !['RADAR_TEAM', 'RADAR_OPERATOR'].includes(origin) || !RADAR_ARTICLE_CODES.includes(code)) return;
  const trimmed = input.value.trim();
  const numeric = trimmed === '' ? 0 : Number.parseInt(trimmed, 10);
  if (!Number.isInteger(numeric) || numeric < 0) {
    input.setCustomValidity('0 veya daha büyük bir sayı girin.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  await updateEvk(evkId, current => {
    const payload = ensurePayload(current);
    const counts = radarCountsForOrigin(payload.penalties, origin);
    if (counts[code] === numeric) return current;
    counts[code] = numeric;
    const preserved = payload.penalties.filter(record => {
      if (record.origin !== origin) return true;
      return !(record.articles || []).some(article => RADAR_ARTICLE_CODES.includes(String(article.code || '').trim()));
    });
    const type = origin === 'RADAR_OPERATOR' ? 'PLATE' : 'DRIVER';
    const normalized = radarGuideArticles().flatMap(article => counts[article.code] > 0 ? [{
      penaltyId: makeChildId('penalty'),
      type,
      articles: [structuredClone(article)],
      vehicleBan: false,
      parking: false,
      licenseCancel: false,
      count: counts[article.code],
      parkingOnly: false,
      origin
    }] : []);
    payload.penalties = [...normalized, ...preserved];
    return { ...current, payload, updatedAt: Date.now() };
  });
  const updated = await getEvk(evkId);
  const index = state.evks.findIndex(item => item.evkId === evkId);
  if (index >= 0 && updated) state.evks[index] = updated;
}

async function editPenaltyCount(penaltyId) {
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
  const record = ensurePayload(evk).penalties.find(item => item.penaltyId === penaltyId);
  if (!record) return;
  const count = await requestPenaltyCount(record.count);
  if (count === null) return;
  if (count === record.count) return;
  await updateEvk(evk.evkId, current => {
    const payload = ensurePayload(current);
    payload.penalties = payload.penalties.map(item => item.penaltyId === penaltyId ? { ...item, count } : item);
    return { ...current, payload, updatedAt: Date.now() };
  });
  await refreshEvks();
}

function requestPenaltyCount(currentCount) {
  const dialog = $('#penaltyCountDialog');
  const form = $('#penaltyCountEditForm');
  const input = $('#penaltyCountEditValue');
  input.value = String(currentCount);
  dialog.showModal();
  input.select();
  return new Promise(resolve => {
    const finish = value => {
      form.removeEventListener('submit', onSubmit);
      $('#penaltyCountEditCancel').removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onDialogCancel);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onSubmit = event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const value = Number.parseInt(input.value, 10);
      if (!Number.isInteger(value) || value < 1) return;
      finish(value);
    };
    const onCancel = () => finish(null);
    const onDialogCancel = event => { event.preventDefault(); finish(null); };
    form.addEventListener('submit', onSubmit);
    $('#penaltyCountEditCancel').addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onDialogCancel);
  });
}

async function deletePenalty(penaltyId) {
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
  if (!evk) return;
  await updateEvk(evk.evkId, current => {
    const payload = ensurePayload(current);
    payload.penalties = payload.penalties.filter(item => item.penaltyId !== penaltyId);
    return { ...current, payload, updatedAt: Date.now() };
  });
  await refreshEvks();
  showToast('Ceza kaydı silindi.');
}

function readControlValue(controls, key) {
  if (Object.hasOwn(controls, key)) return controls[key];
  const legacy = { K1_A: 'k1', K2_A: 'k2A', K2_B: 'k2B', K4_A: 'k4', K5: 'k5', K6: 'k6' }[key];
  return legacy && Object.hasOwn(controls, legacy) ? controls[legacy] : '';
}

function renderControls(controls) {
  $('#controlsGrid').innerHTML = CONTROLS.map(([key, code]) => {
    const value = readControlValue(controls, key);
    return `<label class="control-field"><strong>${escapeHtml(code)}</strong><input type="number" min="0" inputmode="numeric" data-count-section="controls" data-count-key="${escapeHtml(key)}" value="${value === 0 ? '' : escapeHtml(value)}" aria-label="${escapeHtml(code)} kontrol adedi"></label>`;
  }).join('');
}

function renderAccidents(accidents) {
  $('#accidentFields').innerHTML = ACCIDENT_FIELDS.map(([key, label]) => `<label class="field"><span>${escapeHtml(label)}</span><input type="number" min="0" inputmode="numeric" data-count-section="accidents" data-count-key="${escapeHtml(key)}" value="${Object.hasOwn(accidents, key) ? escapeHtml(accidents[key]) : ''}"></label>`).join('');
}

function renderPerformance(evk, noteOverride) {
  const report = buildPerformanceReport(evk, noteOverride);
  $('#performancePreview').textContent = report.text;
  if (document.activeElement !== $('#performanceNote')) $('#performanceNote').value = report.note;
}

function schedulePerformanceNoteSave(input) {
  const evkId = state.selectedEvkId;
  const timerKey = `${evkId}:performance-note`;
  clearTimeout(state.saveTimers.get(timerKey));
  const evk = state.evks.find(item => item.evkId === evkId);
  if (evk) renderPerformance(evk, input.value);
  state.saveTimers.set(timerKey, setTimeout(() => savePerformanceNote(evkId, input.value), 280));
}

async function savePerformanceNote(evkId, value) {
  if (!evkId) return;
  const note = value.trim();
  await updateEvk(evkId, current => {
    const payload = ensurePayload(current);
    if (String(payload.note || '') === note) return current;
    if (note) payload.note = note; else delete payload.note;
    return { ...current, payload, updatedAt: Date.now() };
  });
  const updated = await getEvk(evkId);
  const index = state.evks.findIndex(item => item.evkId === evkId);
  if (index >= 0 && updated) state.evks[index] = updated;
}

async function sharePerformanceText() {
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
  if (!evk) return;
  const text = buildSharePerformanceText(evk, $('#performanceNote').value);
  try {
    if (navigator.share) {
      await navigator.share({ title: `Ekip ${evk.teamCode} İcraatı`, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('İcraat metni panoya kopyalandı.');
  } catch (error) {
    if (error?.name !== 'AbortError') showToast('Metin paylaşılamadı.');
  }
}

function scheduleCountSave(input) {
  const evkId = state.selectedEvkId;
  const timerKey = detailInputTimerKey(input, evkId);
  clearTimeout(state.saveTimers.get(timerKey));
  input.dataset.pendingEvkId = evkId || '';
  state.pendingDetailInputs.add(input);
  const timer = setTimeout(async () => {
    try {
      await saveCountValue(input, evkId);
    } finally {
      if (state.saveTimers.get(timerKey) === timer) state.saveTimers.delete(timerKey);
      state.pendingDetailInputs.delete(input);
      delete input.dataset.pendingEvkId;
    }
  }, 280);
  state.saveTimers.set(timerKey, timer);
}

function detailInputTimerKey(input, evkId) {
  if (input.matches('[data-radar-code]')) return `${evkId}:${input.dataset.radarOrigin}:${input.dataset.radarCode}`;
  return `${evkId}:${input.dataset.countSection}:${input.dataset.countKey}`;
}

async function flushPendingDetailInputs(evkId) {
  const inputs = [...state.pendingDetailInputs].filter(input => input.dataset.pendingEvkId === evkId);
  for (const input of inputs) {
    const timerKey = detailInputTimerKey(input, evkId);
    clearTimeout(state.saveTimers.get(timerKey));
    state.saveTimers.delete(timerKey);
    if (input.matches('[data-radar-code]')) await saveRadarCount(input, evkId);
    else await saveCountValue(input, evkId);
    state.pendingDetailInputs.delete(input);
    delete input.dataset.pendingEvkId;
  }
}

async function saveCountValue(input, evkId = state.selectedEvkId) {
  if (!evkId) return;
  const sectionName = input.dataset.countSection;
  const key = input.dataset.countKey;
  const trimmed = input.value.trim();
  const numeric = trimmed === '' ? null : Number.parseInt(trimmed, 10);
  if (numeric !== null && (!Number.isInteger(numeric) || numeric < 0)) {
    input.setCustomValidity('0 veya daha büyük bir sayı girin.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  await updateEvk(evkId, current => {
    const payload = ensurePayload(current);
    const section = { ...(payload[sectionName] || {}) };
    const oldValue = Object.hasOwn(section, key) ? section[key] : null;
    const legacy = sectionName === 'controls' ? { K1_A: 'k1', K2_A: 'k2A', K2_B: 'k2B', K4_A: 'k4', K5: 'k5', K6: 'k6' }[key] : null;
    if (numeric === null) delete section[key]; else section[key] = numeric;
    if (legacy) delete section[legacy];
    if (oldValue === numeric && !legacy) return current;
    payload[sectionName] = section;
    return { ...current, payload, updatedAt: Date.now() };
  });
  const updated = await getEvk(evkId);
  const index = state.evks.findIndex(item => item.evkId === evkId);
  if (index >= 0 && updated) state.evks[index] = updated;
}

async function requestDeleteEvk(id) {
  const evk = state.evks.find(item => item.evkId === id);
  if (!evk) return;
  const confirmed = await askConfirm('İcraat silinsin mi?', `Ekip ${evk.teamCode} icraatı ve içindeki ceza, kontrol ve kaza verileri silinecek.`, 'Sil', true);
  if (!confirmed) return;
  await deleteEvk(id);
  await refreshEvks();
  showToast('İcraat silindi.');
}

async function requestDeleteAllEvks() {
  if (!state.evks.length) {
    showToast('Silinecek icraat bulunmuyor.');
    return;
  }
  const confirmed = await askConfirm(
    'Tüm icraatler silinsin mi?',
    `Ekrandaki ${state.evks.length} icraat ve içlerindeki tüm ceza, kontrol ve kaza verileri kalıcı olarak silinecek.`,
    'Tümünü Sil',
    true
  );
  if (!confirmed) return;
  await deleteAllEvks();
  showListView();
  await refreshEvks();
  showToast('Tüm icraatler silindi.');
}

function askConfirm(title, message, okLabel = 'Onayla', danger = false) {
  const dialog = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  $('#confirmOk').textContent = okLabel;
  $('#confirmOk').className = danger ? 'danger-button' : 'primary-button';
  dialog.showModal();
  return new Promise(resolve => {
    const finish = value => {
      $('#confirmOk').removeEventListener('click', onOk);
      $('#confirmCancel').removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onDialogCancel);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => finish(true);
    const onCancel = () => finish(false);
    const onDialogCancel = event => { event.preventDefault(); finish(false); };
    $('#confirmOk').addEventListener('click', onOk);
    $('#confirmCancel').addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onDialogCancel);
  });
}

async function prepareEvksForExport(ids) {
  const prepared = [];
  for (const id of ids) {
    const updated = await updateEvk(id, current => ({ ...current, revision: current.revision + 1, updatedAt: Date.now() }));
    prepared.push(updated);
  }
  await refreshEvks();
  return prepared;
}

function makeJsonFile(envelope, name) {
  return new File([JSON.stringify(envelope, null, 2)], name, { type: 'application/json' });
}

function downloadFile(file) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(file);
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function shareFile(file, title, text = 'İcraat kaydı', fallbackMessage = 'Paylaşım desteklenmediği için dosya indirildi.') {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title, text });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
    }
  }
  downloadFile(file);
  showToast(fallbackMessage, 3600);
  return false;
}

function clearReportOutput(message = '') {
  state.reportFile = null;
  $('#previewReport').disabled = true;
  $('#downloadReport').disabled = true;
  $('#shareReport').disabled = true;
  const status = $('#reportStatus');
  status.textContent = message;
  status.classList.remove('error');
}

function renderReportAccidentInputs(savedValues = {}) {
  const incoming = summarizeDailyReport(state.evks).units;
  $('#reportAccidentSections').innerHTML = UNITS.map(unit => `<section class="report-unit-card">
    <h3>${escapeHtml(unit.label)}</h3>
    <section class="report-incoming" aria-label="${escapeHtml(unit.label)} ekiplerden gelen kaza özeti">
      <strong>Ekiplerden gelen son 24 saat</strong>
      <div class="report-incoming-grid">${ACCIDENT_FIELDS.map(([key, label]) => `<div>
        <span>${escapeHtml(label.replace(' Sayısı', ''))}</span><b>${escapeHtml(incoming[unit.code].accidentCounts[key])}</b>
      </div>`).join('')}</div>
      <p>Bir önceki günün birikimli değerlerine ekleyebilirsiniz.</p>
    </section>
    <h4>PDF'ye yazılacak birikimli değerler</h4>
    <div class="report-count-grid">${REPORT_INPUT_FIELDS.map(([key, label, required]) => {
      const saved = savedValues?.[unit.code]?.[key];
      const value = /^\d+$/.test(String(saved ?? '')) ? ` value="${escapeHtml(saved)}"` : '';
      return `<label class="field" data-report-field>
      <span>${escapeHtml(label)}</span>
      <input type="number" min="0" step="1" inputmode="numeric" data-report-unit="${unit.code}" data-report-key="${key}" data-report-required="${required}" ${required ? 'required' : ''}${value}>
    </label>`;
    }).join('')}</div>
  </section>`).join('');
}

function collectReportInputDraft() {
  const values = Object.fromEntries(UNITS.map(unit => [unit.code, {}]));
  $$('[data-report-unit]').forEach(input => {
    const text = input.value.trim();
    if (/^\d+$/.test(text)) values[input.dataset.reportUnit][input.dataset.reportKey] = text;
  });
  return values;
}

async function saveReportInputDraft() {
  clearTimeout(reportInputSaveTimer);
  reportInputSaveTimer = null;
  if (!$$('[data-report-unit]').length) return;
  await setSetting(REPORT_INPUTS_SETTING, collectReportInputDraft());
}

function scheduleReportInputSave() {
  clearTimeout(reportInputSaveTimer);
  reportInputSaveTimer = setTimeout(() => { saveReportInputDraft(); }, 250);
}

async function clearSavedReportInputs() {
  const confirmed = await askConfirm(
    'Kayıtlı PDF verileri temizlensin mi?',
    'Üç birime ait elle girilmiş 18 PDF alanı bu cihazdan temizlenecek. İcraat kayıtları etkilenmez.',
    'Temizle',
    true
  );
  if (!confirmed) return;
  clearTimeout(reportInputSaveTimer);
  reportInputSaveTimer = null;
  await setSetting(REPORT_INPUTS_SETTING, {});
  $$('[data-report-unit]').forEach(input => {
    input.value = '';
    input.closest('[data-report-field]').classList.remove('invalid');
  });
  clearReportOutput('Kayıtlı PDF girişleri temizlendi. Veri yoksa ilgili alana sıfır giriniz.');
  showToast('Kayıtlı PDF girişleri temizlendi.');
}

async function openReportDialog() {
  if (!state.evks.length) {
    showToast('PDF oluşturmak için en az bir icraat kaydı ekleyin.');
    return;
  }
  const savedValues = await getSetting(REPORT_INPUTS_SETTING, {});
  renderReportAccidentInputs(savedValues && typeof savedValues === 'object' ? savedValues : {});
  clearReportOutput('Tüm alanları doldurun. Veri yoksa sıfır giriniz. Girilen değerler bu cihazda saklanır.');
  const earliest = Math.min(...state.evks.map(evk => Number(evk.startEpochMillis)));
  const latest = Math.max(...state.evks.map(evk => Number(evk.endEpochMillis)));
  $('#reportPeriod').textContent = `${state.evks.length} ekip kaydı · ${displayDateTime(earliest)} – ${displayDateTime(latest)}`;
  $('#reportDialog').showModal();
}

function readReportAccidents() {
  const values = Object.fromEntries(UNITS.map(unit => [unit.code, {}]));
  let firstInvalid = null;
  $$('[data-report-unit]').forEach(input => {
    const wrapper = input.closest('[data-report-field]');
    wrapper.classList.remove('invalid');
    const text = input.value.trim();
    const valid = /^\d+$/.test(text) && Number.isSafeInteger(Number(text));
    if (!valid) {
      wrapper.classList.add('invalid');
      if (!firstInvalid) firstInvalid = input;
      return;
    }
    values[input.dataset.reportUnit][input.dataset.reportKey] = Number(text);
  });
  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    throw new Error('Veri yoksa sıfır giriniz.');
  }
  return values;
}

async function generateDailyReport(event) {
  event.preventDefault();
  const status = $('#reportStatus');
  let accidents;
  try {
    accidents = readReportAccidents();
    await saveReportInputDraft();
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
    return;
  }
  const button = $('#generateReport');
  button.disabled = true;
  status.classList.remove('error');
  status.textContent = 'Güncel icraat kayıtlarıyla PDF hazırlanıyor…';
  try {
    const result = await createDailyReportPdf(state.evks.map(evk => structuredClone(evk)), accidents);
    state.reportFile = result.file;
    $('#previewReport').disabled = false;
    $('#downloadReport').disabled = false;
    $('#shareReport').disabled = false;
    status.textContent = `PDF hazır: ${result.report.periodLabel}`;
  } catch (error) {
    clearReportOutput();
    status.textContent = error.message || 'PDF oluşturulamadı.';
    status.classList.add('error');
  } finally {
    button.disabled = false;
  }
}

function previewDailyReport() {
  if (!state.reportFile) return;
  const url = URL.createObjectURL(state.reportFile);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    URL.revokeObjectURL(url);
    showToast('PDF önizleme açılamadı. İndir veya Paylaş seçeneğini kullanın.');
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function shareDailyReport() {
  if (!state.reportFile) return;
  await shareFile(
    state.reportFile,
    'Günlük İcraat PDF',
    'Günlük İcraat PDF raporu',
    'PDF paylaşımı desteklenmediği için dosya indirildi.'
  );
}

async function shareSingleEvk(id) {
  try {
    const [evk] = await prepareEvksForExport([id]);
    const envelope = buildEnvelope([evk], 'SINGLE_EVK');
    const file = makeJsonFile(envelope, buildJsonFileName([evk]));
    await shareFile(file, `Ekip ${evk.teamCode} İcraatı`);
  } catch (error) {
    showToast(error.message || 'İcraat paylaşılamadı.');
  }
}

async function exportAll(share) {
  if (!state.evks.length) {
    showToast('Paylaşılacak icraat yok.');
    return;
  }
  try {
    const prepared = await prepareEvksForExport(state.evks.map(item => item.evkId));
    const envelope = buildEnvelope(prepared, 'ALL_EVK');
    const file = makeJsonFile(envelope, buildJsonFileName(prepared));
    if (share) await shareFile(file, 'Tüm İcraat Kayıtları');
    else {
      downloadFile(file);
      showToast('İcraat arşivi indirildi.');
    }
  } catch (error) {
    showToast(error.message || 'Dışa aktarma tamamlanamadı.');
  }
}

async function importJsonFile(file) {
  try {
    const envelope = JSON.parse(await file.text());
    const incomingRecords = validateEnvelope(envelope);
    const working = new Map(state.evks.map(record => [record.evkId, record]));
    const accepted = [];
    let skipped = 0;
    let warnings = 0;

    for (const incoming of incomingRecords) {
      const local = working.get(incoming.evkId);
      if (!local) {
        const duplicate = [...working.values()].find(record => sameLogicalShift(record, incoming));
        if (duplicate) {
          warnings += 1;
          const addAnyway = await askConfirm(
            'Benzer ekip kaydı bulundu',
            `Ekip ${incoming.teamCode} için aynı birim ve saatlere sahip farklı kimlikli bir kayıt var. Gelen kayıt yine de eklensin mi?`,
            'Yine de Ekle'
          );
          if (!addAnyway) { skipped += 1; continue; }
        }
        accepted.push(incoming);
        working.set(incoming.evkId, incoming);
        continue;
      }

      const comparison = compareIncoming(local, incoming);
      if (comparison === 'IDENTICAL') { skipped += 1; continue; }
      let title = 'Bu ekip kaydı daha önce mevcut';
      let message = 'Gelen kayıt ile telefondaki kayıt farklı.';
      let okLabel = 'Gelenle Güncelle';
      if (comparison === 'NEWER') message = 'Gelen kayıt daha yeni. Telefondaki kayıt güncellensin mi?';
      if (comparison === 'OLDER') {
        title = 'Gelen kayıt daha eski';
        message = 'Telefonda daha güncel kayıt bulundu. Yine de gelen kayıt kullanılsın mı?';
        okLabel = 'Yine de Değiştir';
      }
      if (comparison === 'SAME_REVISION_DIFFERENT_TIME') message = 'Revizyonlar aynı ancak son güncelleme zamanları farklı. Gelen kayıt kullanılsın mı?';
      if (comparison === 'SAME_METADATA_DIFFERENT_CONTENT') message = 'Kayıt bilgileri aynı görünse de içerikler farklı. Gelen kayıt kullanılsın mı?';
      warnings += 1;
      const replace = await askConfirm(title, message, okLabel, comparison === 'OLDER');
      if (replace) {
        accepted.push(incoming);
        working.set(incoming.evkId, incoming);
      } else skipped += 1;
    }

    await putManyEvks(accepted);
    await absorbDirectoriesFromEvks(accepted);
    await refreshEvks();
    showToast(`${accepted.length} kayıt alındı, ${skipped} kayıt atlandı${warnings ? `, ${warnings} uyarı gösterildi` : ''}.`, 4800);
  } catch (error) {
    showToast(error.message || 'JSON dosyası içe aktarılamadı.', 4500);
  } finally {
    $('#importInput').value = '';
  }
}

async function loadPenaltyGuide() {
  try {
    const response = await fetch('./assets/ceza_rehberi.json');
    if (!response.ok) throw new Error('Ceza rehberi okunamadı.');
    const data = await response.json();
    const currentYear = new Date().getFullYear();
    const all = Array.isArray(data.maddeler) ? data.maddeler : [];
    const current = all.filter(item => Number(item.yil) === currentYear);
    state.guide = (current.length ? current : all).map(item => ({
      code: String(item.madde || '').trim(),
      amount: Number(item.fiyat) || 0,
      year: Number(item.yil) || currentYear,
      description: String(item.aciklama || '').trim()
    })).filter(item => item.code);
  } catch {
    state.guide = [];
  }
}

function bindEvents() {
  $('#menuButton').addEventListener('click', () => toggleMenu());
  menuBackdrop.addEventListener('click', () => toggleMenu(false));
  $('#addTeamButton').addEventListener('click', () => openTeamDialog());
  $('[data-close-team]').addEventListener('click', () => teamDialog.close());
  teamForm.addEventListener('submit', saveTeam);
  $('#backButton').addEventListener('click', () => history.back());

  $('#addOfficerButton').addEventListener('click', () => {
    state.editingOfficerId = null;
    renderOfficerDirectory();
    $('#officerDialog').showModal();
  });
  $('[data-close-officer]').addEventListener('click', () => $('#officerDialog').close());
  $('#newOfficerButton').addEventListener('click', () => showOfficerEditor());
  $('#cancelOfficerEdit').addEventListener('click', returnToOfficerDirectory);
  $('#officerEditorDialog').addEventListener('cancel', event => { event.preventDefault(); returnToOfficerDirectory(); });
  $('#officerSurname').addEventListener('input', event => {
    const input = event.currentTarget;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const upper = input.value.toLocaleUpperCase('tr-TR');
    if (upper === input.value) return;
    input.value = upper;
    if (start !== null && end !== null) input.setSelectionRange(start, end);
  });
  $('#officerForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const current = state.personnelDirectory.find(item => item.id === state.editingOfficerId);
    const person = {
      id: current?.id || makeChildId('person'), sicil: $('#officerRegistry').value.trim(),
      ad: $('#officerName').value.trim(), soyad: $('#officerSurname').value.trim().toLocaleUpperCase('tr-TR')
    };
    const duplicate = state.personnelDirectory.find(item => item.id !== current?.id
      && directoryItemKey(item, 'personnel') === directoryItemKey(person, 'personnel'));
    if (duplicate) {
      showToast('Bu görevli zaten kayıtlı.');
      return;
    }
    if (current) {
      state.personnelDirectory = state.personnelDirectory.map(item => item.id === current.id ? person : item);
      const oldKey = directoryItemKey(current, 'personnel');
      state.draftPersonnel = state.draftPersonnel.map(item => directoryItemKey(item, 'personnel') === oldKey ? structuredClone(person) : item);
    } else {
      state.personnelDirectory.push(person);
      state.draftPersonnel.push(structuredClone(person));
    }
    state.personnelDirectory = sortPersonnelByRegistry(state.personnelDirectory);
    state.draftPersonnel = sortPersonnelByRegistry(state.draftPersonnel);
    await setSetting('personnel_directory', state.personnelDirectory);
    renderTeamDraftLists();
    returnToOfficerDirectory();
  });
  $('#savedOfficerList').addEventListener('click', async event => {
    const toggle = event.target.closest('[data-toggle-officer]');
    const edit = event.target.closest('[data-edit-officer]');
    const remove = event.target.closest('[data-delete-officer]');
    if (toggle) {
      const person = state.personnelDirectory.find(item => item.id === toggle.dataset.toggleOfficer);
      if (person) toggleDirectorySelection(person, 'personnel');
    }
    if (edit) showOfficerEditor(edit.dataset.editOfficer);
    if (remove) {
      const person = state.personnelDirectory.find(item => item.id === remove.dataset.deleteOfficer);
      if (!person) return;
      const confirmed = await askConfirm('Görevli kaydı silinsin mi?', `${person.ad} ${person.soyad} kayıtlı görevli listesinden silinecek. Geçmiş icraat kayıtları değişmez.`, 'Sil', true);
      if (!confirmed) return;
      const key = directoryItemKey(person, 'personnel');
      state.personnelDirectory = state.personnelDirectory.filter(item => item.id !== person.id);
      state.draftPersonnel = state.draftPersonnel.filter(item => directoryItemKey(item, 'personnel') !== key);
      await setSetting('personnel_directory', state.personnelDirectory);
      renderTeamDraftLists();
      renderOfficerDirectory();
    }
  });
  $('#officerList').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-officer]');
    if (!button) return;
    state.draftPersonnel = state.draftPersonnel.filter(person => person.id !== button.dataset.removeOfficer);
    renderTeamDraftLists();
  });

  $('#addRoadButton').addEventListener('click', () => {
    state.editingRoadId = null;
    renderRoadDirectory();
    $('#roadDialog').showModal();
  });
  $('[data-close-road]').addEventListener('click', () => $('#roadDialog').close());
  $('#newRoadButton').addEventListener('click', () => showRoadEditor());
  $('#cancelRoadEdit').addEventListener('click', returnToRoadDirectory);
  $('#roadEditorDialog').addEventListener('cancel', event => { event.preventDefault(); returnToRoadDirectory(); });
  $('#roadForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const current = state.roadDirectory.find(item => item.id === state.editingRoadId);
    const road = { id: current?.id || makeChildId('road'), yolad: $('#roadName').value.trim() };
    const duplicate = state.roadDirectory.find(item => item.id !== current?.id
      && directoryItemKey(item, 'roads') === directoryItemKey(road, 'roads'));
    if (duplicate) {
      showToast('Bu yol zaten kayıtlı.');
      return;
    }
    if (current) {
      state.roadDirectory = state.roadDirectory.map(item => item.id === current.id ? road : item);
      const oldKey = directoryItemKey(current, 'roads');
      state.draftRoads = state.draftRoads.map(item => directoryItemKey(item, 'roads') === oldKey ? structuredClone(road) : item);
    } else {
      state.roadDirectory.push(road);
      state.draftRoads.push(structuredClone(road));
    }
    await setSetting('road_directory', state.roadDirectory);
    renderTeamDraftLists();
    returnToRoadDirectory();
  });
  $('#savedRoadList').addEventListener('click', async event => {
    const toggle = event.target.closest('[data-toggle-road]');
    const edit = event.target.closest('[data-edit-road]');
    const remove = event.target.closest('[data-delete-road]');
    if (toggle) {
      const road = state.roadDirectory.find(item => item.id === toggle.dataset.toggleRoad);
      if (road) toggleDirectorySelection(road, 'roads');
    }
    if (edit) showRoadEditor(edit.dataset.editRoad);
    if (remove) {
      const road = state.roadDirectory.find(item => item.id === remove.dataset.deleteRoad);
      if (!road) return;
      const confirmed = await askConfirm('Yol kaydı silinsin mi?', `${road.yolad} kayıtlı yol listesinden silinecek. Geçmiş icraat kayıtları değişmez.`, 'Sil', true);
      if (!confirmed) return;
      const key = directoryItemKey(road, 'roads');
      state.roadDirectory = state.roadDirectory.filter(item => item.id !== road.id);
      state.draftRoads = state.draftRoads.filter(item => directoryItemKey(item, 'roads') !== key);
      await setSetting('road_directory', state.roadDirectory);
      renderTeamDraftLists();
      renderRoadDirectory();
    }
  });
  $('#roadList').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-road]');
    if (!button) return;
    state.draftRoads = state.draftRoads.filter(road => road.id !== button.dataset.removeRoad);
    renderTeamDraftLists();
  });

  cardMenuDialog.addEventListener('click', event => {
    const button = event.target.closest('[data-card-action]');
    if (!button) return;
    const id = state.cardActionId;
    cardMenuDialog.close();
    if (button.dataset.cardAction === 'edit') openTeamDialog(id);
    if (button.dataset.cardAction === 'share') shareSingleEvk(id);
    if (button.dataset.cardAction === 'delete') requestDeleteEvk(id);
  });

  $$('.tabs [role="tab"]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  $('#penaltyForm').addEventListener('submit', savePenalty);
  $('#penaltyForm').addEventListener('pointerdown', keepArticleSearchFocused);
  $('#penaltyCount').addEventListener('focus', selectPenaltyCount);
  $('#penaltyCount').addEventListener('click', selectPenaltyCount);
  articleSearch.addEventListener('input', () => renderArticleResults(articleSearch.value));
  $('#clearArticleSearch').addEventListener('click', () => {
    articleSearch.value = '';
    renderArticleResults('');
    articleSearch.focus();
  });
  articleResults.addEventListener('click', event => {
    const button = event.target.closest('[data-guide-index]');
    if (!button) return;
    const codes = JSON.parse(articleResults.dataset.resultCodes || '[]');
    const code = codes[Number(button.dataset.guideIndex)];
    const article = availableGuide().find(item => item.code === code);
    if (article && !state.selectedArticles.some(item => item.code === article.code)) {
      state.selectedArticles.push(structuredClone(article));
      renderSelectedArticles();
    }
    articleSearch.value = '';
    renderArticleResults('');
  });
  $('#selectedArticles').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-article]');
    if (!button) return;
    state.selectedArticles.splice(Number(button.dataset.removeArticle), 1);
    renderSelectedArticles();
  });
  $('#penaltyList').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-penalty]');
    if (edit) editPenaltyCount(edit.dataset.editPenalty);
  });
  detailScreen.addEventListener('input', event => {
    const input = event.target.closest('[data-count-section]');
    if (input) scheduleCountSave(input);
    const radarInput = event.target.closest('[data-radar-code]');
    if (radarInput) scheduleRadarCountSave(radarInput);
    if (event.target === $('#performanceNote')) schedulePerformanceNoteSave(event.target);
  });
  $('#sharePerformance').addEventListener('click', sharePerformanceText);
  detailScreen.addEventListener('focusin', event => {
    if (event.target.matches('[data-count-section], [data-radar-code]')) scheduleFocusedCountVisibility();
  });

  overflowMenu.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    toggleMenu(false);
    if (button.dataset.action === 'pdf') openReportDialog();
    if (button.dataset.action === 'import') $('#importInput').click();
    if (button.dataset.action === 'share') exportAll(true);
    if (button.dataset.action === 'delete-all') requestDeleteAllEvks();
    if (button.dataset.action === 'about') $('#infoDialog').showModal();
  });
  $('[data-close-report]').addEventListener('click', async () => {
    await saveReportInputDraft();
    $('#reportDialog').close();
  });
  $('#reportForm').addEventListener('submit', generateDailyReport);
  $('#reportForm').addEventListener('input', event => {
    if (!event.target.matches('[data-report-unit]')) return;
    event.target.closest('[data-report-field]').classList.remove('invalid');
    scheduleReportInputSave();
    if (state.reportFile) clearReportOutput('Kaza verileri değişti. Güncel PDF için yeniden PDF Oluştur’a dokunun.');
  });
  $('#clearReportInputs').addEventListener('click', clearSavedReportInputs);
  $('#previewReport').addEventListener('click', previewDailyReport);
  $('#downloadReport').addEventListener('click', () => {
    if (!state.reportFile) return;
    downloadFile(state.reportFile);
    showToast('PDF indirildi.');
  });
  $('#shareReport').addEventListener('click', shareDailyReport);
  $('[data-close-info]').addEventListener('click', () => $('#infoDialog').close());
  $('#importInput').addEventListener('change', event => {
    const [file] = event.target.files;
    if (file) importJsonFile(file);
  });

  window.addEventListener('popstate', event => {
    if (event.state?.evkId && state.evks.some(item => item.evkId === event.state.evkId)) openDetail(event.state.evkId, false);
    else showListView();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      updatePenaltyComposerMetrics();
      scheduleFocusedCountVisibility();
    });
    window.visualViewport.addEventListener('scroll', updatePenaltyComposerMetrics);
  }
  window.addEventListener('resize', updatePenaltyComposerMetrics);
  window.addEventListener('orientationchange', () => {
    largestVisualViewportHeight = 0;
    requestAnimationFrame(updatePenaltyComposerMetrics);
  });
}

async function init() {
  bindEvents();
  renderSelectedArticles();
  new ResizeObserver(updatePenaltyComposerMetrics).observe($('#penaltyForm'));
  updatePenaltyComposerMetrics();
  try {
    await openDatabase();
    await Promise.all([refreshEvks(), loadPenaltyGuide()]);
    const match = location.hash.match(/^#evk=(.+)$/);
    if (match) openDetail(decodeURIComponent(match[1]), false);
  } catch (error) {
    showToast(error.message || 'Uygulama başlatılamadı.', 5000);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

async function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const register = tool => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});

  await register({
    name: 'list_evks',
    title: 'EVK kayıtlarını listele',
    description: 'Cihazda kayıtlı EVK kayıtlarının kimlik, birim, ekip, görev ve zaman özetlerini döndürür.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() {
      return sortedEvks().map(evk => ({
        evkId: evk.evkId,
        sourceUnit: evk.sourceUnit,
        teamCode: evk.teamCode,
        dutyType: evk.dutyType,
        startDateTime: evk.startDateTime,
        endDateTime: evk.endDateTime
      }));
    }
  });

  await register({
    name: 'create_evk',
    title: 'EVK oluştur',
    description: 'Görünür Ekip Ekle formuyla aynı kuralları kullanarak yeni bir EVK kaydı oluşturur.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceUnit: { type: 'string', enum: UNITS.map(unit => unit.code) },
        teamCode: { type: 'string', pattern: '^[0-9]+$' },
        dutyType: { type: 'string', enum: ['GUNDUZ', 'GECE', 'ARA_EKIP', 'RADAR'] },
        startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        startTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        endTime: { type: 'string', pattern: '^\\d{2}:\\d{2}$' }
      },
      required: ['sourceUnit', 'teamCode', 'dutyType', 'startDate', 'startTime', 'endDate', 'endTime'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!UNITS.some(unit => unit.code === input.sourceUnit)) throw new Error('Geçersiz birim.');
      if (!/^\d+$/.test(input.teamCode)) throw new Error('Ekip kodu yalnızca rakamlardan oluşmalıdır.');
      if (!['GUNDUZ', 'GECE', 'ARA_EKIP', 'RADAR'].includes(input.dutyType)) throw new Error('Geçersiz görev türü.');
      const startDateTime = toIstanbulIso(input.startDate, input.startTime);
      const endDateTime = toIstanbulIso(input.endDate, input.endTime);
      const startEpochMillis = Date.parse(startDateTime);
      const endEpochMillis = Date.parse(endDateTime);
      if (!Number.isFinite(startEpochMillis) || !Number.isFinite(endEpochMillis) || endEpochMillis <= startEpochMillis) {
        throw new Error('Bitiş zamanı başlangıçtan sonra olmalıdır.');
      }
      const duplicate = state.evks.find(evk => evk.sourceUnit === input.sourceUnit
        && evk.teamCode === input.teamCode && evk.startDateTime === startDateTime
        && evk.endDateTime === endDateTime);
      if (duplicate) throw new Error('Aynı ekip ve saatlere sahip başka bir EVK bulundu.');
      let evkId;
      do { evkId = makeRandomId(); } while (await evkIdExists(evkId));
      const now = Date.now();
      await putEvk({
        recordType: 'EVK', evkId, revision: 0, createdAt: now, updatedAt: now,
        sourceUnit: input.sourceUnit, reportPeriod: input.startDate, teamCode: input.teamCode,
        dutyType: input.dutyType, startDateTime, endDateTime, startEpochMillis, endEpochMillis,
        payload: ensurePayload({})
      });
      await setSetting('last_selected_unit', input.sourceUnit);
      await refreshEvks();
      return { evkId, status: 'created' };
    }
  });
}

init().then(registerWebMcp);
