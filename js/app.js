// ==================== STATE ====================
const state = {
  caseId: generateVorgangsnummer(),
  unfallId: generateUnfallId(),
  personen: [],
  editingPersonIndex: null, // null = new, number = editing existing
  pendingPerson: null // person pending confirmation after personenabfrage warning
};

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('home-case-id').textContent = state.caseId;
  document.getElementById('home-unfall-id').textContent = state.unfallId;

  // Set default date/time
  const now = new Date();
  document.getElementById('unfall-datum').value = now.toISOString().split('T')[0];
  document.getElementById('unfall-beginnzeit').value = now.toTimeString().slice(0, 5);

  // Character counter for description
  document.getElementById('unfall-beschreibung').addEventListener('input', (e) => {
    document.getElementById('beschreibung-count').textContent = e.target.value.length + ' ZEICHEN';
  });

  renderPersonenList();
});

// ==================== NAVIGATION ====================
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  window.scrollTo(0, 0);
}

// ==================== ID GENERATION ====================
// Vorgangsnummer format: "HE-DDMMYYYY-NNNNNN"
function generateVorgangsnummer() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const counter = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
  return `HE-${dd}${mm}${yyyy}-${counter}`;
}

// Unfall-ID format: short hex, e.g. "344ddfb-e24a"
function generateUnfallId() {
  const hex = (n) => Array.from({ length: n }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `${hex(7)}-${hex(4)}`;
}

// Build a Date from "YYYY-MM-DD" + "HH:MM". Returns null if either is missing.
function buildLocalDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

// e.g. "Fri Mar 13 2026 12:39:09 GMT+0100 (Central European Standard Time)"
function formatDateLong(dateStr, timeStr) {
  const d = buildLocalDate(dateStr, timeStr);
  return d ? d.toString() : '';
}

// e.g. "2026-03-04T12:00:00+01:00"
function formatIsoWithOffset(dateStr, timeStr) {
  const d = buildLocalDate(dateStr, timeStr);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const tzMinTotal = -d.getTimezoneOffset(); // e.g. +60 for CET
  const sign = tzMinTotal >= 0 ? '+' : '-';
  const abs = Math.abs(tzMinTotal);
  const tzH = pad(Math.floor(abs / 60));
  const tzM = pad(abs % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
         `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
         `${sign}${tzH}:${tzM}`;
}

// ==================== PERSON MANAGEMENT ====================
function showAddPerson() {
  state.editingPersonIndex = null;
  clearPersonForm();

  // Set ordnungsnummer
  navigateTo('page-add-person');
  updatePersonProgress();
}

function editPerson(index) {
  state.editingPersonIndex = index;
  const person = state.personen[index];

  document.getElementById('person-nachname').value = person.nachname || '';
  document.getElementById('person-vorname').value = person.vorname || '';
  document.getElementById('person-geburtsdatum').value = person.geburtsdatum || '';
  document.getElementById('person-rolle').value = person.rolle || '';
  document.getElementById('person-email').value = person.email || '';
  document.getElementById('person-adresse').value = person.adresse || '';

  updatePersonHeader();
  navigateTo('page-add-person');
  updatePersonProgress();
}

function clearPersonForm() {
  const fields = [
    'person-nachname', 'person-vorname', 'person-geburtsdatum',
    'person-rolle', 'person-email', 'person-adresse'
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('person-header-name').textContent = 'Neue Person';
}

function updatePersonHeader() {
  const nachname = document.getElementById('person-nachname').value;
  const vorname = document.getElementById('person-vorname').value;
  const headerEl = document.getElementById('person-header-name');

  if (nachname || vorname) {
    headerEl.textContent = [vorname, nachname].filter(Boolean).join(' ');
  } else {
    headerEl.textContent = 'Neue Person';
  }

  updatePersonProgress();
}

function updatePersonProgress() {
  const fields = ['person-nachname', 'person-vorname', 'person-geburtsdatum', 'person-rolle'];
  const optional = ['person-email', 'person-adresse'];
  const allFields = [...fields, ...optional];

  let filled = 0;
  allFields.forEach(id => {
    if (document.getElementById(id).value) filled++;
  });

  const pct = Math.round((filled / allFields.length) * 100);
  const missing = allFields.length - filled;

  document.getElementById('person-progress-fill').style.width = pct + '%';
  document.getElementById('person-progress-label').textContent =
    missing > 0 ? missing + ' Angaben fehlen noch' : 'Alle Angaben vollstandig';
}

async function savePerson() {
  const nachname = document.getElementById('person-nachname').value.trim();
  const vorname = document.getElementById('person-vorname').value.trim();

  if (!nachname || !vorname) {
    showAlert('Pflichtfelder', 'Bitte geben Sie mindestens Nachname und Vorname ein.', 'warning');
    return;
  }

  const personData = {
    nachname,
    vorname,
    geburtsdatum: document.getElementById('person-geburtsdatum').value,
    rolle: document.getElementById('person-rolle').value,
    email: document.getElementById('person-email').value.trim(),
    adresse: document.getElementById('person-adresse').value.trim(),
    warning: null
  };

  // Ask Celonis for prior-accident info before committing the person
  await runPersonenabfrage(personData);
}

// Sends a personenabfrage to Celonis. If the response contains a warning
// message, the person is held as "pending" and a confirmation modal is shown.
// Otherwise the person is committed immediately.
async function runPersonenabfrage(personData) {
  const payload = {
    type: "personenabfrage",
    case_id: state.caseId,
    unfall_id: state.unfallId,
    person: {
      first_name: personData.vorname,
      last_name: personData.nachname,
      birth_date: personData.geburtsdatum,
      role: personData.rolle,
      email: personData.email,
      address: personData.adresse
    }
  };

  showLoading('Person wird \u00fcberpr\u00fcft...');

  let warning = null;
  try {
    // IMPORTANT: use text/plain to avoid a CORS preflight. The Celonis hook
    // endpoint returns 403 on OPTIONS, which blocks the POST entirely.
    // text/plain is a "simple request" content-type and skips preflight.
    // Celonis parses the JSON body regardless of the Content-Type header.
    const response = await fetch(CONFIG.PERSONENABFRAGE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const text = await response.text();
      if (text && text.trim()) {
        let parsed = text;
        try { parsed = JSON.parse(text); } catch {}
        warning = extractWarningMessage(parsed);
      }
    }
  } catch (err) {
    // If CORS or network blocks the response, we continue without a warning.
    // The request itself was still delivered to Celonis.
    console.warn('personenabfrage: unable to read response', err);
  }

  hideLoading();

  if (warning) {
    personData.warning = warning;
    state.pendingPerson = personData;
    document.getElementById('modal-suspicious-message').textContent = warning;
    document.getElementById('modal-suspicious').classList.add('active');
  } else {
    commitPerson(personData);
  }
}

function extractWarningMessage(data) {
  if (!data) return null;
  if (typeof data === 'string') {
    const t = data.trim();
    if (!t || t.toLowerCase() === 'accepted' || t.toLowerCase() === 'ok') return null;
    return t;
  }
  if (typeof data === 'object') {
    // common shapes: { message: "..." } / { warning: "..." } / { text: "..." }
    for (const k of ['message', 'warning', 'text', 'hinweis', 'result']) {
      if (typeof data[k] === 'string' && data[k].trim()) return data[k];
    }
    // fall back to first non-empty string in the object
    for (const k of Object.keys(data)) {
      const nested = extractWarningMessage(data[k]);
      if (nested) return nested;
    }
  }
  return null;
}

function commitPerson(personData) {
  if (state.editingPersonIndex !== null) {
    state.personen[state.editingPersonIndex] = personData;
  } else {
    state.personen.push(personData);
  }
  state.pendingPerson = null;
  renderPersonenList();
  navigateTo('page-home');
}

function confirmAddPerson() {
  document.getElementById('modal-suspicious').classList.remove('active');
  if (state.pendingPerson) {
    commitPerson(state.pendingPerson);
  }
}

function cancelAddPerson() {
  document.getElementById('modal-suspicious').classList.remove('active');
  state.pendingPerson = null;
  // Stay on the person page so the user can edit/cancel
}

function removePerson(index, event) {
  event.stopPropagation();
  state.personen.splice(index, 1);
  renderPersonenList();
}

function renderPersonenList() {
  const container = document.getElementById('personen-list');

  if (state.personen.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--ios-text-tertiary); font-size: 15px;">
        Noch keine Personen hinzugef&uuml;gt
      </div>
    `;
    return;
  }

  container.innerHTML = state.personen.map((p, i) => {
    const warningTag = p.warning ? '<span class="inline-tag">Hinweis</span>' : '';

    return `
      <div class="person-card" onclick="editPerson(${i})">
        <div class="person-avatar">${getInitials(p.vorname, p.nachname)}</div>
        <div class="person-info">
          <div class="name">${p.vorname} ${p.nachname} ${warningTag}</div>
          <div class="detail">${p.rolle || 'Keine Rolle'}</div>
          ${p.geburtsdatum ? '<div class="sub-detail">geb. am ' + formatDate(p.geburtsdatum) + '</div>' : ''}
        </div>
        <button class="delete-btn" onclick="removePerson(${i}, event)" title="Entfernen">&times;</button>
      </div>
    `;
  }).join('');
}

function getInitials(vorname, nachname) {
  return ((vorname?.[0] || '') + (nachname?.[0] || '')).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

// ==================== CASE SUBMISSION ====================
async function submitCase() {
  const strasse = document.getElementById('unfall-strasse').value.trim();
  const plz = document.getElementById('unfall-plz').value.trim();
  const ort = document.getElementById('unfall-ort').value.trim();

  if (!strasse || !plz || !ort) {
    showAlert('Pflichtfelder', 'Bitte f\u00fcllen Sie mindestens Stra\u00dfe, PLZ und Ort aus.', 'warning');
    return;
  }

  showLoading('Vorgang wird \u00fcbertragen...');

  const payload = {
    type: "verkehrsunfall",
    case_id: state.caseId,
    unfall_id: state.unfallId,
    accident: {
      date: formatDateLong(document.getElementById('unfall-datum').value, document.getElementById('unfall-beginnzeit').value),
      beginnzeit: formatIsoWithOffset(document.getElementById('unfall-datum').value, document.getElementById('unfall-beginnzeit').value),
      endzeit: formatIsoWithOffset(document.getElementById('unfall-datum').value, document.getElementById('unfall-endzeit').value),
      unfalltype: document.getElementById('unfall-type').value,
      unfallcategory: document.getElementById('unfall-category').value,
      description: document.getElementById('unfall-beschreibung').value.trim(),
      location: {
        street: strasse,
        house_number: document.getElementById('unfall-hausnummer').value.trim(),
        postal_code: plz,
        city: ort
      }
    },
    persons: state.personen.map((p, i) => ({
      ordnungsnummer: 'ON' + String(i + 1).padStart(2, '0'),
      first_name: p.vorname,
      last_name: p.nachname,
      role: p.rolle,
      birth_date: p.geburtsdatum,
      email: p.email,
      address: p.adresse
    }))
  };

  try {
    // text/plain avoids a CORS preflight. Celonis Action Flow webhooks parse
    // the JSON body regardless of Content-Type. (With application/json the
    // preflight OPTIONS call returns 403 and the POST is never sent.)
    await fetch(CONFIG.TRANSFER_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: JSON.stringify(payload)
    });

    hideLoading();

    document.getElementById('modal-success-message').textContent =
      'Der Vorgang ' + state.caseId + ' wurde an Celonis \u00fcbertragen.';
    document.getElementById('modal-success').classList.add('active');
  } catch (error) {
    hideLoading();
    showAlert('Verbindungsfehler', 'Keine Verbindung zum Server m\u00f6glich.\n\n' + error.message, 'error');
  }
}

// ==================== MODALS ====================
function showAlert(title, message, type) {
  const glyphMap = {
    warning: '!',
    success: '\u2713', // ✓
    error: '\u2715',   // ✕
    info: 'i'
  };
  const badge = document.getElementById('modal-icon');
  badge.textContent = glyphMap[type] || 'i';
  badge.className = 'modal-badge ' + (type || '');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-alert').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-alert').classList.remove('active');
}

function closeSuccessAndReset() {
  document.getElementById('modal-success').classList.remove('active');
  resetApp();
}

// ==================== LOADING ====================
function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Laden...';
  document.getElementById('loading-overlay').classList.add('active');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('active');
}

// ==================== RESET ====================
function resetApp() {
  state.caseId = generateVorgangsnummer();
  state.unfallId = generateUnfallId();
  state.personen = [];
  state.editingPersonIndex = null;
  state.pendingPerson = null;

  document.getElementById('home-case-id').textContent = state.caseId;
  document.getElementById('home-unfall-id').textContent = state.unfallId;

  // Reset form fields
  const now = new Date();
  document.getElementById('unfall-datum').value = now.toISOString().split('T')[0];
  document.getElementById('unfall-beginnzeit').value = now.toTimeString().slice(0, 5);
  document.getElementById('unfall-endzeit').value = '';
  document.getElementById('unfall-type').value = '';
  document.getElementById('unfall-category').value = '';
  document.getElementById('unfall-strasse').value = '';
  document.getElementById('unfall-hausnummer').value = '';
  document.getElementById('unfall-plz').value = '';
  document.getElementById('unfall-ort').value = '';
  document.getElementById('unfall-beschreibung').value = '';
  document.getElementById('beschreibung-count').textContent = '0 ZEICHEN';

  renderPersonenList();
  navigateTo('page-home');
}
