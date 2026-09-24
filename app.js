import {
  deleteEvk, evkIdExists, getAllEvks, getEvk, getSetting, openDatabase,
  putEvk, putManyEvks, setSetting, updateEvk
} from './db.js';
import {
  ACCIDENT_FIELDS, CONTROLS, PENALTY_TYPES, UNITS, buildEnvelope, compareIncoming,
  displayDateTime, dutyLabel, ensurePayload, makeChildId, makeRandomId, sameLogicalShift,
  toIstanbulIso, unitLabel, validateEnvelope
} from './domain.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  evks: [],
  selectedEvkId: null,
  editingEvkId: null,
  cardActionId: null,
  draftPersonnel: [],
  draftRoads: [],
  selectedArticles: [],
  guide: [],
  saveTimers: new Map()
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

let toastTimer;

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
  $('#teamCount').textContent = String(sorted.length);
  $('#unitCount').textContent = String(new Set(sorted.map(item => item.sourceUnit)).size);

  if (!sorted.length) {
    teamList.innerHTML = `<div class="empty-state">
      <div class="empty-mark" aria-hidden="true">EVK</div>
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

function teamCardHtml(evk) {
  return `<div class="swipe-shell">
    <span class="swipe-label edit">GÜNCELLE</span>
    <span class="swipe-label delete">SİL</span>
    <article class="team-card" data-id="${escapeHtml(evk.evkId)}" tabindex="0" aria-label="${escapeHtml(evk.teamCode)} numaralı ekip">
      <div class="team-icon" aria-hidden="true">EK</div>
      <div class="team-code"><strong>${escapeHtml(evk.teamCode)}</strong><span>(${escapeHtml(dutyLabel(evk.dutyType))})</span></div>
      <div class="team-meta"><strong>${escapeHtml(unitLabel(evk.sourceUnit))}</strong><span>${escapeHtml(displayDateTime(evk.startEpochMillis))}</span><span>${escapeHtml(displayDateTime(evk.endEpochMillis))}</span></div>
      <button type="button" class="share-button" aria-label="EVK’yi paylaş" data-share-id="${escapeHtml(evk.evkId)}">↗</button>
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

  card.querySelector('.share-button').addEventListener('click', event => {
    event.stopPropagation();
    shareSingleEvk(id);
  });

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
      'Aynı birim, ekip kodu, başlangıç ve bitiş zamanına sahip başka bir EVK var. Yine de kaydedilsin mi?',
      'Yine de Kaydet'
    );
    if (!proceed) return;
  }

  let evkId = existing?.evkId;
  if (!evkId) {
    do { evkId = makeRandomId(); } while (await evkIdExists(evkId));
  }
  const payload = existing ? ensurePayload(existing) : ensurePayload({});
  payload.personnel = structuredClone(state.draftPersonnel);
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
  selectTab('penalties');
  renderDetail(evk);
  if (pushHistory) history.pushState({ evkId: id }, '', `#evk=${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0 });
}

function renderDetail(evk) {
  const payload = ensurePayload(evk);
  $('#detailSummary').innerHTML = `<span><strong>${escapeHtml(dutyLabel(evk.dutyType))}</strong> · ${escapeHtml(unitLabel(evk.sourceUnit))}</span><span>${escapeHtml(displayDateTime(evk.startEpochMillis))}</span>`;
  const radar = evk.dutyType === 'RADAR';
  $('#radarOriginField').hidden = !radar;
  $('#penaltyTypeGroup').hidden = radar;
  renderPenaltyList(payload.penalties);
  renderControls(payload.controls);
  renderAccidents(payload.accidents);
  if (radar) enforceRadarType();
}

function selectTab(name) {
  $$('.tabs [role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
  const names = ['penalties', 'controls', 'accidents', 'performance'];
  names.forEach(value => { $(`#${value}Panel`).hidden = value !== name; });
}

function renderPenaltyList(records) {
  const container = $('#penaltyList');
  if (!records.length) {
    container.innerHTML = '<div class="penalty-empty">Bu EVK için henüz ceza kaydı yok.</div>';
    return;
  }
  container.innerHTML = records.map(record => {
    const codes = record.articles?.map(article => article.code).join(', ') || 'Madde yok';
    const flags = [record.vehicleBan && 'Araç Men', record.parking && 'Otoparka', record.licenseCancel && 'Belge İptal'].filter(Boolean).join(' · ');
    const type = record.parkingOnly ? 'Yalnızca Otopark' : (PENALTY_TYPES[record.type] || record.type || 'Diğer');
    const origin = record.origin === 'RADAR_OPERATOR' ? 'Radar · Plaka' : record.origin === 'RADAR_TEAM' ? 'Radar · Ekip' : type;
    return `<article class="penalty-card">
      <div><h3>${escapeHtml(record.count)} × ${escapeHtml(origin)}</h3><p>${escapeHtml(codes)}${flags ? `<br>${escapeHtml(flags)}` : ''}</p></div>
      <div class="penalty-card-actions"><button type="button" data-edit-penalty="${escapeHtml(record.penaltyId)}" aria-label="Adedi düzenle">#</button><button type="button" data-delete-penalty="${escapeHtml(record.penaltyId)}" aria-label="Cezayı sil">×</button></div>
    </article>`;
  }).join('');
}

function renderSelectedArticles() {
  $('#selectedArticles').innerHTML = state.selectedArticles.map((article, index) => `<span class="article-chip">${escapeHtml(article.code)}<button type="button" data-remove-article="${index}" aria-label="Maddeyi kaldır">×</button></span>`).join('');
}

function availableGuide() {
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
  if (evk?.dutyType !== 'RADAR') return state.guide;
  return state.guide.filter(article => /^51\/2-b-[1-9]$/i.test(article.code.trim()));
}

function renderArticleResults(query) {
  const normalized = query.trim().toLocaleLowerCase('tr-TR');
  if (!normalized) {
    articleResults.hidden = true;
    articleResults.innerHTML = '';
    return;
  }
  const matches = availableGuide().filter(article =>
    article.code.toLocaleLowerCase('tr-TR').includes(normalized)
    || article.description.toLocaleLowerCase('tr-TR').includes(normalized)
  ).slice(0, 30);
  articleResults.innerHTML = matches.length ? matches.map((article, index) => `<button type="button" class="article-result" data-guide-index="${index}"><strong>${escapeHtml(article.code)}</strong><span>${escapeHtml(article.description)} · ${escapeHtml(article.amount)} TL</span></button>`).join('') : '<div class="penalty-empty">Eşleşen madde bulunamadı.</div>';
  articleResults.dataset.resultCodes = JSON.stringify(matches.map(article => article.code));
  articleResults.hidden = false;
}

function enforceRadarType() {
  const origin = document.querySelector('[name="radarOrigin"]:checked')?.value || 'RADAR_OPERATOR';
  const typeInput = document.querySelector(`[name="penaltyType"][value="${origin === 'RADAR_OPERATOR' ? 'PLATE' : 'DRIVER'}"]`);
  if (typeInput) typeInput.checked = true;
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
  const radar = evk.dutyType === 'RADAR';
  const origin = radar ? document.querySelector('[name="radarOrigin"]:checked').value : 'NORMAL';
  const type = parkingOnly ? null : radar
    ? (origin === 'RADAR_OPERATOR' ? 'PLATE' : 'DRIVER')
    : document.querySelector('[name="penaltyType"]:checked').value;
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
  renderSelectedArticles();
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

async function removePenalty(penaltyId) {
  const confirmed = await askConfirm('Ceza kaydı silinsin mi?', 'Bu işlem yalnızca seçili ceza grubunu siler.', 'Sil', true);
  if (!confirmed) return;
  const evk = state.evks.find(item => item.evkId === state.selectedEvkId);
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
  $('#controlsGrid').innerHTML = CONTROLS.map(([key, code, description]) => {
    const value = readControlValue(controls, key);
    return `<label class="control-field"><strong>${escapeHtml(code)}</strong><span>${escapeHtml(description)}</span><input type="number" min="0" inputmode="numeric" data-count-section="controls" data-count-key="${escapeHtml(key)}" value="${value === 0 ? '' : escapeHtml(value)}"></label>`;
  }).join('');
}

function renderAccidents(accidents) {
  $('#accidentFields').innerHTML = ACCIDENT_FIELDS.map(([key, label]) => `<label class="field"><span>${escapeHtml(label)}</span><input type="number" min="0" inputmode="numeric" data-count-section="accidents" data-count-key="${escapeHtml(key)}" value="${Object.hasOwn(accidents, key) ? escapeHtml(accidents[key]) : ''}"></label>`).join('');
}

function scheduleCountSave(input) {
  const timerKey = `${state.selectedEvkId}:${input.dataset.countSection}:${input.dataset.countKey}`;
  clearTimeout(state.saveTimers.get(timerKey));
  state.saveTimers.set(timerKey, setTimeout(() => saveCountValue(input), 280));
}

async function saveCountValue(input) {
  const evkId = state.selectedEvkId;
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
  const confirmed = await askConfirm('EVK silinsin mi?', `Ekip ${evk.teamCode} kaydı ve içindeki ceza, kontrol ve kaza verileri silinecek.`, 'Sil', true);
  if (!confirmed) return;
  await deleteEvk(id);
  await refreshEvks();
  showToast('EVK silindi.');
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

async function shareFile(file, title) {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    try {
      await navigator.share({ files: [file], title, text: 'İcraat EVK kaydı' });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') return false;
    }
  }
  downloadFile(file);
  showToast('Paylaşım desteklenmediği için JSON dosyası indirildi.', 3600);
  return false;
}

async function shareSingleEvk(id) {
  try {
    const [evk] = await prepareEvksForExport([id]);
    const envelope = buildEnvelope([evk], 'SINGLE_EVK');
    const file = makeJsonFile(envelope, `EVK_${evk.sourceUnit}_${evk.teamCode}_${evk.reportPeriod}.json`);
    await shareFile(file, `Ekip ${evk.teamCode} EVK`);
  } catch (error) {
    showToast(error.message || 'EVK paylaşılamadı.');
  }
}

async function exportAll(share) {
  if (!state.evks.length) {
    showToast('Dışa aktarılacak EVK yok.');
    return;
  }
  try {
    const prepared = await prepareEvksForExport(state.evks.map(item => item.evkId));
    const envelope = buildEnvelope(prepared, 'ALL_EVK');
    const today = new Date().toISOString().slice(0, 10);
    const file = makeJsonFile(envelope, `ICRAAT_TUM_EVK_${today}.json`);
    if (share) await shareFile(file, 'Tüm İcraat EVK kayıtları');
    else {
      downloadFile(file);
      showToast('EVK arşivi indirildi.');
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
    $('#officerForm').reset();
    $('#officerDialog').showModal();
  });
  $('[data-close-officer]').addEventListener('click', () => $('#officerDialog').close());
  $('#officerForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    state.draftPersonnel.push({
      id: makeChildId('person'), sicil: $('#officerRegistry').value.trim(),
      ad: $('#officerName').value.trim(), soyad: $('#officerSurname').value.trim()
    });
    $('#officerDialog').close();
    renderTeamDraftLists();
  });
  $('#officerList').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-officer]');
    if (!button) return;
    state.draftPersonnel = state.draftPersonnel.filter(person => person.id !== button.dataset.removeOfficer);
    renderTeamDraftLists();
  });

  $('#addRoadButton').addEventListener('click', () => {
    $('#roadForm').reset();
    $('#roadDialog').showModal();
  });
  $('[data-close-road]').addEventListener('click', () => $('#roadDialog').close());
  $('#roadForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    state.draftRoads.push({ id: makeChildId('road'), yolad: $('#roadName').value.trim() });
    $('#roadDialog').close();
    renderTeamDraftLists();
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
  articleSearch.addEventListener('input', () => renderArticleResults(articleSearch.value));
  $('#clearArticleSearch').addEventListener('click', () => {
    articleSearch.value = '';
    articleResults.hidden = true;
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
    articleResults.hidden = true;
  });
  $('#selectedArticles').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-article]');
    if (!button) return;
    state.selectedArticles.splice(Number(button.dataset.removeArticle), 1);
    renderSelectedArticles();
  });
  document.querySelectorAll('[name="radarOrigin"]').forEach(input => input.addEventListener('change', enforceRadarType));
  $('#penaltyList').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit-penalty]');
    const remove = event.target.closest('[data-delete-penalty]');
    if (edit) editPenaltyCount(edit.dataset.editPenalty);
    if (remove) removePenalty(remove.dataset.deletePenalty);
  });
  detailScreen.addEventListener('input', event => {
    const input = event.target.closest('[data-count-section]');
    if (input) scheduleCountSave(input);
  });

  overflowMenu.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    toggleMenu(false);
    if (button.dataset.action === 'import') $('#importInput').click();
    if (button.dataset.action === 'export') exportAll(false);
    if (button.dataset.action === 'share') exportAll(true);
    if (button.dataset.action === 'about') $('#infoDialog').showModal();
  });
  $('[data-close-info]').addEventListener('click', () => $('#infoDialog').close());
  $('#importInput').addEventListener('change', event => {
    const [file] = event.target.files;
    if (file) importJsonFile(file);
  });

  window.addEventListener('popstate', event => {
    if (event.state?.evkId && state.evks.some(item => item.evkId === event.state.evkId)) openDetail(event.state.evkId, false);
    else showListView();
  });
  window.addEventListener('online', updateConnectivity);
  window.addEventListener('offline', updateConnectivity);
}

function updateConnectivity() {
  $('#offlineState').textContent = navigator.onLine ? 'Hazır' : 'Offline';
}

async function init() {
  bindEvents();
  renderSelectedArticles();
  updateConnectivity();
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
