/* store.js
 * Data layer: organisations, batches, clinics.
 * Persisted to localStorage. Pure functions only — no DOM here.
 */

const STORAGE_KEY = 'nhse-appointment-planner:v1';

const ORG_COLORS = ['#2a6f97', '#b5541b', '#5b7f3e']; // Humberside, Somerset, Manchester

// How many appointments a batch can support per (week)day, for working out
// how long a batch's "runway" needs to be.
const DAILY_APPOINTMENT_CAPACITY = 50;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function shiftISODate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekdayISO(iso) {
  const day = new Date(iso + 'T00:00:00').getDay(); // 0 = Sun ... 6 = Sat
  return day >= 1 && day <= 5;
}

// The ISO date of the nth (1-indexed) weekday on or after `iso`. `iso`
// itself counts as day 1 if it's already a weekday.
function nthWeekdayOnOrAfter(iso, n) {
  let d = new Date(iso + 'T00:00:00');
  let count = isWeekdayISO(iso) ? 1 : 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day >= 1 && day <= 5) count++;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function defaultData() {
  const orgs = [
    { id: 'org-humberside', name: 'Humberside', color: ORG_COLORS[0] },
    { id: 'org-somerset', name: 'Somerset', color: ORG_COLORS[1] },
    { id: 'org-manchester', name: 'Manchester', color: ORG_COLORS[2] },
  ];
  return { orgs, batches: [], clinics: [] };
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.orgs) || !Array.isArray(parsed.batches) || !Array.isArray(parsed.clinics)) {
      return null;
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse stored data, starting fresh.', e);
    return null;
  }
}

function saveRaw(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const Store = (function () {
  const existingRaw = loadRaw();
  let data = existingRaw || defaultData();
  const hadStoredDataOnLoad = Boolean(existingRaw);
  const listeners = [];

  function persist() {
    saveRaw(data);
    listeners.forEach((fn) => fn(data));
  }

  return {
    onChange(fn) {
      listeners.push(fn);
    },

    getData() {
      return data;
    },

    // True if this browser already had data saved before this page load
    // (i.e. this isn't a brand-new visitor with an empty localStorage).
    hadStoredData() {
      return hadStoredDataOnLoad;
    },

    // ---- Organisations ----
    getOrgs() {
      return data.orgs.slice();
    },
    getOrg(id) {
      return data.orgs.find((o) => o.id === id) || null;
    },
    addOrg(name) {
      const org = { id: 'org-' + uid(), name, color: ORG_COLORS[data.orgs.length % ORG_COLORS.length] };
      data.orgs.push(org);
      persist();
      return org;
    },

    // ---- Batches ----
    getBatches() {
      return data.batches.slice();
    },
    getBatch(id) {
      return data.batches.find((b) => b.id === id) || null;
    },
    addBatch({ orgId, name, specDate, peopleCount }) {
      const batch = { id: 'batch-' + uid(), orgId, name, specDate, peopleCount: Number(peopleCount) };
      data.batches.push(batch);
      persist();
      return batch;
    },
    updateBatch(id, patch) {
      const batch = this.getBatch(id);
      if (!batch) return null;
      Object.assign(batch, patch);
      if (patch.peopleCount !== undefined) batch.peopleCount = Number(patch.peopleCount);
      persist();
      return batch;
    },
    deleteBatch(id) {
      data.batches = data.batches.filter((b) => b.id !== id);
      // Clinics referencing this batch keep the reference but it will show as "(deleted batch)".
      persist();
    },

    // ---- Clinics ----
    getClinics() {
      return data.clinics.slice();
    },
    getClinic(id) {
      return data.clinics.find((c) => c.id === id) || null;
    },
    addClinic({ orgId, date, slots, batchId }) {
      const clinic = { id: 'clinic-' + uid(), orgId, date, slots: Number(slots), batchId: batchId || null };
      data.clinics.push(clinic);
      persist();
      return clinic;
    },
    updateClinic(id, patch) {
      const clinic = this.getClinic(id);
      if (!clinic) return null;
      Object.assign(clinic, patch);
      if (patch.slots !== undefined) clinic.slots = Number(patch.slots);
      persist();
      return clinic;
    },
    deleteClinic(id) {
      data.clinics = data.clinics.filter((c) => c.id !== id);
      persist();
    },

    // ---- Derived ----
    slotsAllocatedForBatch(batchId) {
      return data.clinics
        .filter((c) => c.batchId === batchId)
        .reduce((sum, c) => sum + (Number(c.slots) || 0), 0);
    },
    clinicsForBatch(batchId) {
      return data.clinics.filter((c) => c.batchId === batchId);
    },
    shiftDate(iso, days) {
      return shiftISODate(iso, days);
    },
    // The window a batch needs to get everyone an appointment, at
    // DAILY_APPOINTMENT_CAPACITY appointments per weekday (Mon–Fri;
    // weekends aren't counted as capacity, though they're included in the
    // displayed range rather than skipped over). `end` is exclusive.
    getBatchRunway(batchId) {
      const batch = this.getBatch(batchId);
      if (!batch || !batch.specDate) return null;
      const peopleCount = Number(batch.peopleCount) || 0;
      const workingDays = Math.ceil(peopleCount / DAILY_APPOINTMENT_CAPACITY);
      if (workingDays <= 0) {
        return { start: batch.specDate, end: batch.specDate, workingDays: 0 };
      }
      const lastDay = nthWeekdayOnOrAfter(batch.specDate, workingDays);
      const end = shiftISODate(lastDay, 1); // exclusive end = the day after the last working day used
      return { start: batch.specDate, end, workingDays };
    },

    // ---- Import / export / reset ----
    exportJSON() {
      return JSON.stringify(data, null, 2);
    },
    importJSON(json) {
      const parsed = JSON.parse(json);
      if (!parsed || !Array.isArray(parsed.orgs) || !Array.isArray(parsed.batches) || !Array.isArray(parsed.clinics)) {
        throw new Error('That file does not look like a valid export from this app.');
      }
      data = parsed;
      persist();
    },
    resetToSample() {
      data = sampleData();
      persist();
    },
    clearAll() {
      data = defaultData();
      persist();
    },
  };
})();

function sampleData() {
  const base = defaultData();
  const [humberside, somerset, manchester] = base.orgs;

  const b1 = { id: 'batch-sample-1', orgId: humberside.id, name: 'HUM-2026-01', specDate: '2026-10-05', peopleCount: 450 };
  const b2 = { id: 'batch-sample-2', orgId: humberside.id, name: 'HUM-2026-02', specDate: '2026-11-16', peopleCount: 620 };
  const b3 = { id: 'batch-sample-3', orgId: somerset.id, name: 'SOM-2026-01', specDate: '2026-10-12', peopleCount: 300 };
  const b4 = { id: 'batch-sample-4', orgId: manchester.id, name: 'MAN-2026-01', specDate: '2026-10-19', peopleCount: 800 };

  base.batches = [b1, b2, b3, b4];

  base.clinics = [
    { id: 'clinic-sample-1', orgId: humberside.id, date: '2026-10-20', slots: 60, batchId: b1.id },
    { id: 'clinic-sample-2', orgId: humberside.id, date: '2026-10-27', slots: 60, batchId: b1.id },
    { id: 'clinic-sample-3', orgId: somerset.id, date: '2026-10-26', slots: 40, batchId: b3.id },
    { id: 'clinic-sample-4', orgId: manchester.id, date: '2026-11-02', slots: 75, batchId: b4.id },
  ];

  return base;
}
