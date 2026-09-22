/* app.js
 * UI wiring: tabs, tables, forms/modal, calendar detail popovers,
 * data import/export.
 */

(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtRunway = (batchId) => {
    const r = Store.getBatchRunway(batchId);
    if (!r) return '—';
    if (r.workingDays === 0) return `${fmtDate(r.start)} (no people to appoint)`;
    const endInclusive = Store.shiftDate(r.end, -1);
    const range = `${fmtDate(r.start)} – ${fmtDate(endInclusive)}`;
    return `${range} (${r.workingDays} working day${r.workingDays === 1 ? '' : 's'} at 50/day)`;
  };

  // ---------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------
  function initTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach((b) => b.classList.remove('active'));
        $$('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        $('#view-' + btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'calendar') {
          Calendar.refresh(currentOrgFilter());
          syncFocusPanel();
        }
      });
    });
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  // ---------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------
  function openModal(node) {
    const modal = $('#modal');
    modal.innerHTML = '';
    modal.appendChild(node);
    $('#modal-backdrop').classList.remove('hidden');
  }
  function closeModal() {
    $('#modal-backdrop').classList.add('hidden');
    $('#modal').innerHTML = '';
  }
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ---------------------------------------------------------------
  // Org select helpers
  // ---------------------------------------------------------------
  function orgOptionsHTML(selectedId) {
    return Store.getOrgs()
      .map((o) => `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${o.name}</option>`)
      .join('');
  }

  function currentOrgFilter() {
    const sel = $('#cal-org-filter');
    return sel && sel.value ? sel.value : null;
  }

  function renderOrgFilterAndLegend() {
    const sel = $('#cal-org-filter');
    const orgs = Store.getOrgs();
    sel.innerHTML = '<option value="">All organisations</option>' + orgOptionsHTML();
    const legend = $('#cal-legend');
    legend.innerHTML = orgs
      .map((o) => `<span class="legend-item"><span class="swatch" style="background:${o.color}"></span>${o.name}</span>`)
      .join('');
  }

  // ---------------------------------------------------------------
  // Batch form
  // ---------------------------------------------------------------
  function batchFormNode(existing) {
    const wrap = document.createElement('form');
    wrap.className = 'form';
    wrap.innerHTML = `
      <h3>${existing ? 'Edit batch' : 'Add batch'}</h3>
      <label>Organisation
        <select name="orgId" required>${orgOptionsHTML(existing ? existing.orgId : null)}</select>
      </label>
      <label>Batch name
        <input name="name" type="text" required value="${existing ? escapeHtml(existing.name) : ''}" placeholder="e.g. HUM-2026-03">
      </label>
      <label>Batch specification date
        <input name="specDate" type="date" required value="${existing ? existing.specDate : ''}">
      </label>
      <label>Number of people in batch
        <input name="peopleCount" type="number" min="0" step="1" required value="${existing ? existing.peopleCount : ''}">
      </label>
      <div class="form-actions">
        ${existing ? '<button type="button" class="btn-danger" data-action="delete">Delete</button>' : '<span></span>'}
        <div>
          <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </div>
    `;

    wrap.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(wrap);
      const payload = {
        orgId: fd.get('orgId'),
        name: fd.get('name').trim(),
        specDate: fd.get('specDate'),
        peopleCount: fd.get('peopleCount'),
      };
      if (existing) {
        Store.updateBatch(existing.id, payload);
        toast('Batch updated');
      } else {
        Store.addBatch(payload);
        toast('Batch added');
      }
      closeModal();
      refreshAll();
    });

    const cancelBtn = wrap.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const delBtn = wrap.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        const linked = Store.clinicsForBatch(existing.id);
        const msg = linked.length
          ? `Delete "${existing.name}"? ${linked.length} clinic(s) reference this batch and will show it as deleted.`
          : `Delete "${existing.name}"?`;
        if (window.confirm(msg)) {
          Store.deleteBatch(existing.id);
          toast('Batch deleted');
          closeModal();
          refreshAll();
        }
      });
    }

    return wrap;
  }

  // ---------------------------------------------------------------
  // Clinic form
  // ---------------------------------------------------------------
  function clinicFormNode(existing, prefill) {
    const wrap = document.createElement('form');
    wrap.className = 'form';

    const initialOrg = existing
      ? existing.orgId
      : (prefill && prefill.orgId) || (Store.getOrgs()[0] && Store.getOrgs()[0].id);

    wrap.innerHTML = `
      <h3>${existing ? 'Edit clinic' : 'Add clinic'}</h3>
      <label>Organisation
        <select name="orgId" required>${orgOptionsHTML(initialOrg)}</select>
      </label>
      <label>Clinic date
        <input name="date" type="date" required value="${existing ? existing.date : ''}">
      </label>
      <label>Number of appointment slots
        <input name="slots" type="number" min="0" step="1" required value="${existing ? existing.slots : ''}">
      </label>
      <label>Batch being appointed from
        <select name="batchId" id="clinic-batch-select"></select>
      </label>
      <p class="hint">Only batches belonging to the selected organisation are listed. Leave as "No batch selected" if this clinic's batch isn't decided yet.</p>
      <div class="form-actions">
        ${existing ? '<button type="button" class="btn-danger" data-action="delete">Delete</button>' : '<span></span>'}
        <div>
          <button type="button" class="btn-secondary" data-action="cancel">Cancel</button>
          <button type="submit" class="btn-primary">Save</button>
        </div>
      </div>
    `;

    function populateBatchSelect(orgId) {
      const batchSelect = wrap.querySelector('#clinic-batch-select');
      const batches = Store.getBatches().filter((b) => b.orgId === orgId);
      const selectedBatchId = existing ? existing.batchId : null;
      batchSelect.innerHTML =
        '<option value="">No batch selected</option>' +
        batches
          .map(
            (b) =>
              `<option value="${b.id}" ${b.id === selectedBatchId ? 'selected' : ''}>${escapeHtml(b.name)} (spec ${fmtDate(b.specDate)}, ${b.peopleCount} people)</option>`
          )
          .join('');
    }

    populateBatchSelect(initialOrg);
    if (!existing && prefill && prefill.batchId) {
      wrap.querySelector('#clinic-batch-select').value = prefill.batchId;
    }
    wrap.querySelector('select[name="orgId"]').addEventListener('change', (e) => {
      populateBatchSelect(e.target.value);
    });

    wrap.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(wrap);
      const payload = {
        orgId: fd.get('orgId'),
        date: fd.get('date'),
        slots: fd.get('slots'),
        batchId: fd.get('batchId') || null,
      };
      if (existing) {
        Store.updateClinic(existing.id, payload);
        toast('Clinic updated');
      } else {
        Store.addClinic(payload);
        toast('Clinic added');
      }
      closeModal();
      refreshAll();
    });

    const cancelBtn = wrap.querySelector('[data-action="cancel"]');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    const delBtn = wrap.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (window.confirm('Delete this clinic date?')) {
          Store.deleteClinic(existing.id);
          toast('Clinic deleted');
          closeModal();
          refreshAll();
        }
      });
    }

    return wrap;
  }

  // ---------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------
  function renderBatchesTable() {
    const tbody = $('#batches-table tbody');
    const batches = Store.getBatches().slice().sort((a, b) => (a.specDate || '').localeCompare(b.specDate || ''));
    if (!batches.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty">No batches yet. Click "+ Add batch" to create one.</td></tr>`;
      return;
    }
    tbody.innerHTML = batches
      .map((b) => {
        const org = Store.getOrg(b.orgId);
        const allocated = Store.slotsAllocatedForBatch(b.id);
        const linkedClinics = Store.clinicsForBatch(b.id).slice().sort((a, c) => (a.date || '').localeCompare(c.date || ''));
        const clinicCount = linkedClinics.length;
        const clinicTooltip = clinicCount
          ? linkedClinics.map((c) => fmtDate(c.date)).join(', ')
          : 'No clinics linked yet';
        return `
          <tr data-id="${b.id}" class="row-clickable" data-type="batch">
            <td><span class="swatch" style="background:${org ? org.color : '#888'}"></span>${org ? org.name : '—'}</td>
            <td>${escapeHtml(b.name)}</td>
            <td>${fmtDate(b.specDate)}</td>
            <td class="muted">${fmtRunway(b.id)}</td>
            <td class="num">${b.peopleCount}</td>
            <td class="num" title="${escapeHtml(clinicTooltip)}">${allocated} <span class="muted">(${clinicCount} clinic${clinicCount === 1 ? '' : 's'})</span></td>
            <td>
              <button type="button" class="btn-link" data-action="focus-batch" data-id="${b.id}">On calendar</button>
              <button type="button" class="btn-link" data-action="edit-batch" data-id="${b.id}">Edit</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function renderClinicsTable() {
    const tbody = $('#clinics-table tbody');
    const clinics = Store.getClinics().slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!clinics.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">No clinic dates yet. Click "+ Add clinic" to create one.</td></tr>`;
      return;
    }
    tbody.innerHTML = clinics
      .map((c) => {
        const org = Store.getOrg(c.orgId);
        const batch = c.batchId ? Store.getBatch(c.batchId) : null;
        const inviteDate = c.date ? Store.shiftDate(c.date, -21) : null;
        return `
          <tr data-id="${c.id}" class="row-clickable" data-type="clinic">
            <td><span class="swatch" style="background:${org ? org.color : '#888'}"></span>${org ? org.name : '—'}</td>
            <td>${fmtDate(c.date)}</td>
            <td class="muted">${inviteDate ? fmtDate(inviteDate) : '—'}</td>
            <td class="num">${c.slots}</td>
            <td>${batch ? escapeHtml(batch.name) : (c.batchId ? '<span class="over">deleted batch</span>' : '<span class="muted">Not yet decided</span>')}</td>
            <td><button type="button" class="btn-link" data-action="edit-clinic" data-id="${c.id}">Edit</button></td>
          </tr>
        `;
      })
      .join('');
  }

  function showBatchOnCalendar(batchId) {
    const batch = Store.getBatch(batchId);
    if (!batch) return;
    $$('.tab-btn').forEach((b) => b.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));
    $('.tab-btn[data-tab="calendar"]').classList.add('active');
    $('#view-calendar').classList.add('active');
    $('#cal-org-filter').value = batch.orgId;
    Calendar.goToMonthOf(batch.specDate);
    Calendar.setFocusedBatch(batch.id);
    Calendar.refresh(currentOrgFilter());
    syncFocusPanel();
  }

  function initTableClicks() {
    $('#batches-table').addEventListener('click', (e) => {
      const focusBtn = e.target.closest('[data-action="focus-batch"]');
      if (focusBtn) {
        e.stopPropagation();
        showBatchOnCalendar(focusBtn.dataset.id);
        return;
      }
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const batch = Store.getBatch(row.dataset.id);
      if (batch) openModal(batchFormNode(batch));
    });
    $('#clinics-table').addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-id]');
      if (!row) return;
      const clinic = Store.getClinic(row.dataset.id);
      if (clinic) openModal(clinicFormNode(clinic));
    });
  }

  // ---------------------------------------------------------------
  // Data tab: export / import / sample / clear
  // ---------------------------------------------------------------
  function initDataTab() {
    $('#btn-export').addEventListener('click', () => {
      const json = Store.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `nhse-appointment-planner-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Exported');
    });

    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJSON(reader.result);
          toast('Data imported');
          refreshAll();
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    $('#btn-load-sample').addEventListener('click', () => {
      if (window.confirm('This replaces all current data with sample data. Continue?')) {
        Store.resetToSample();
        toast('Sample data loaded');
        refreshAll();
      }
    });

    $('#btn-clear-all').addEventListener('click', () => {
      if (window.confirm('This permanently deletes all batches and clinics. Continue?')) {
        Store.clearAll();
        toast('All data cleared');
        refreshAll();
      }
    });
  }

  // ---------------------------------------------------------------
  // Calendar: clinic chips open the edit form directly; batch chips
  // "focus" the batch instead, driving the panel below.
  // ---------------------------------------------------------------
  function initCalendar() {
    Calendar.init($('#calendar-container'), {
      onClinicClick: (clinic) => openModal(clinicFormNode(clinic)),
      onBatchFocusChange: (batch) => renderFocusPanel(batch),
    });
    $('#cal-org-filter').addEventListener('change', () => {
      Calendar.refresh(currentOrgFilter());
      syncFocusPanel();
    });
  }

  function syncFocusPanel() {
    renderFocusPanel(Calendar.getFocusedBatch());
  }

  function renderFocusPanel(batch) {
    const panel = $('#batch-focus-panel');
    if (!batch) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    const org = Store.getOrg(batch.orgId);
    const allocated = Store.slotsAllocatedForBatch(batch.id);
    const remaining = batch.peopleCount - allocated;
    const linked = Store.clinicsForBatch(batch.id).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    panel.style.setProperty('--org-color', org ? org.color : '#888');
    panel.innerHTML = `
      <h3>${org ? escapeHtml(org.name) : ''} — ${escapeHtml(batch.name)}</h3>
      <div class="fp-meta">Specified ${fmtDate(batch.specDate)} · ${batch.peopleCount} people · ${allocated} slots allocated across ${linked.length} clinic${linked.length === 1 ? '' : 's'} (${remaining} remaining)</div>
      <div class="fp-meta"><strong>Runway (available to appoint from):</strong> ${fmtRunway(batch.id)}</div>
      <ul>${linked.map((c) => `<li data-id="${c.id}">${fmtDate(c.date)} — ${c.slots} slots</li>`).join('') || '<li class="muted">No clinics linked yet — add one below.</li>'}</ul>
      <div class="focus-panel-actions">
        <button type="button" class="btn-primary" data-action="add-clinic">+ Add clinic for this batch</button>
        <button type="button" class="btn-secondary" data-action="edit-batch">Edit batch</button>
        <button type="button" class="btn-link" data-action="clear-focus">Clear focus</button>
      </div>
    `;
    panel.classList.remove('hidden');

    panel.querySelectorAll('li[data-id]').forEach((li) => {
      li.addEventListener('click', () => {
        const clinic = Store.getClinic(li.dataset.id);
        if (clinic) openModal(clinicFormNode(clinic));
      });
    });
    panel.querySelector('[data-action="add-clinic"]').addEventListener('click', () => {
      openModal(clinicFormNode(null, { orgId: batch.orgId, batchId: batch.id }));
    });
    panel.querySelector('[data-action="edit-batch"]').addEventListener('click', () => {
      openModal(batchFormNode(batch));
    });
    panel.querySelector('[data-action="clear-focus"]').addEventListener('click', () => {
      Calendar.clearFocus();
      Calendar.refresh(currentOrgFilter());
      syncFocusPanel();
    });
  }

  // ---------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function refreshAll() {
    renderOrgFilterAndLegend();
    renderBatchesTable();
    renderClinicsTable();
    Calendar.refresh(currentOrgFilter());
    syncFocusPanel();
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initTableClicks();
    initDataTab();
    initCalendar();

    $('#btn-add-batch').addEventListener('click', () => openModal(batchFormNode(null)));
    $('#btn-add-clinic').addEventListener('click', () => openModal(clinicFormNode(null)));

    renderOrgFilterAndLegend();
    renderBatchesTable();
    renderClinicsTable();
    Calendar.refresh(null);

    // Friendly first-run nudge if there's no data at all yet.
    if (!Store.getBatches().length && !Store.getClinics().length) {
      toast('No data yet — add a batch/clinic, or load sample data from the Data tab.');
    }
  });
})();
