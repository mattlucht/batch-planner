/* calendar.js
 * Renders a rolling 4-month page showing batch specification dates
 * and clinic dates together, colour-coded by organisation.
 * No external dependencies.
 */

const Calendar = (function () {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTHS_PER_PAGE = 4;

  let current = startOfMonth(new Date()); // first month of the displayed page
  let container = null;
  let onClinicClick = null;
  let onBatchFocusChange = null;
  let focusedBatchId = null;

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function addMonths(d, delta) {
    return new Date(d.getFullYear(), d.getMonth() + delta, 1);
  }

  function hexToRgba(hex, alpha) {
    const clean = (hex || '888888').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const n = parseInt(full, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function pageRangeLabel(startMonth, count) {
    const endMonth = addMonths(startMonth, count - 1);
    const startLabel = `${MONTH_NAMES[startMonth.getMonth()]} ${startMonth.getFullYear()}`;
    const endLabel = `${MONTH_NAMES[endMonth.getMonth()]} ${endMonth.getFullYear()}`;
    return `${startLabel} – ${endLabel}`;
  }

  // Monday-first grid covering the full weeks that touch this month.
  function buildGrid(year, month) {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // 0 = Monday
    const gridStart = new Date(year, month, 1 - startOffset);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function eventsByDate(orgFilter) {
    const map = {};
    const orgs = Store.getOrgs();
    const orgById = Object.fromEntries(orgs.map((o) => [o.id, o]));

    Store.getBatches().forEach((b) => {
      if (orgFilter && b.orgId !== orgFilter) return;
      if (!b.specDate) return;
      map[b.specDate] = map[b.specDate] || [];
      map[b.specDate].push({ kind: 'batch', item: b, org: orgById[b.orgId] });
    });

    Store.getClinics().forEach((c) => {
      if (orgFilter && c.orgId !== orgFilter) return;
      if (!c.date) return;
      map[c.date] = map[c.date] || [];
      map[c.date].push({ kind: 'clinic', item: c, org: orgById[c.orgId] });
    });

    return map;
  }

  // Builds one compact month block (title + day-of-week row + day grid).
  function renderMonthBlock(monthDate, orgFilter, events, todayISO, runway, focusedOrg) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const grid = buildGrid(year, month);

    const block = document.createElement('div');
    block.className = 'cal-month';

    const title = document.createElement('h3');
    title.className = 'cal-month-title';
    title.textContent = `${MONTH_NAMES[month]} ${year}`;
    block.appendChild(title);

    const dowRow = document.createElement('div');
    dowRow.className = 'cal-grid cal-dow';
    DAY_NAMES.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'cal-dow-cell';
      el.textContent = d;
      dowRow.appendChild(el);
    });
    block.appendChild(dowRow);

    const gridEl = document.createElement('div');
    gridEl.className = 'cal-grid cal-days';

    grid.forEach((date) => {
      const iso = toISODate(date);
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      if (date.getMonth() !== month) cell.classList.add('cal-cell--muted');
      if (iso === todayISO) cell.classList.add('cal-cell--today');

      if (runway && iso >= runway.start && iso < runway.end) {
        cell.classList.add('cal-cell--runway');
        cell.style.background = hexToRgba(focusedOrg ? focusedOrg.color : '#888', 0.14);
        cell.style.borderColor = hexToRgba(focusedOrg ? focusedOrg.color : '#888', 0.6);
      }

      const dateLabel = document.createElement('div');
      dateLabel.className = 'cal-date';
      dateLabel.textContent = date.getDate();
      cell.appendChild(dateLabel);

      const dayEvents = events[iso] || [];
      const chipWrap = document.createElement('div');
      chipWrap.className = 'cal-chips';
      dayEvents.forEach((ev) => {
        const isFocusedBatch = ev.kind === 'batch' && focusedBatchId && ev.item.id === focusedBatchId;
        const isLinkedClinic = ev.kind === 'clinic' && focusedBatchId && ev.item.batchId === focusedBatchId;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `cal-chip cal-chip--${ev.kind}`;
        if (isFocusedBatch || isLinkedClinic) chip.classList.add('cal-chip--focused');
        else if (focusedBatchId) chip.classList.add('cal-chip--dimmed');
        chip.style.setProperty('--org-color', ev.org ? ev.org.color : '#888');
        const label = ev.kind === 'batch'
          ? `Spec: ${ev.item.name}`
          : `Clinic: ${ev.item.slots} slots`;
        chip.textContent = label;
        chip.title = ev.org ? ev.org.name : '';
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (ev.kind === 'batch') {
            focusedBatchId = focusedBatchId === ev.item.id ? null : ev.item.id;
            render(orgFilter);
            if (onBatchFocusChange) onBatchFocusChange(focusedBatchId ? ev.item : null);
          } else if (onClinicClick) {
            onClinicClick(ev.item);
          }
        });
        chipWrap.appendChild(chip);
      });
      cell.appendChild(chipWrap);

      gridEl.appendChild(cell);
    });

    block.appendChild(gridEl);
    return block;
  }

  function render(orgFilter) {
    if (!container) return;

    // Keep focus state consistent: drop it if the batch was deleted, or
    // if it's been filtered out by the organisation dropdown.
    if (focusedBatchId) {
      const fb = Store.getBatch(focusedBatchId);
      if (!fb || (orgFilter && fb.orgId !== orgFilter)) {
        focusedBatchId = null;
      }
    }
    const focusedBatch = focusedBatchId ? Store.getBatch(focusedBatchId) : null;
    const runway = focusedBatch ? Store.getBatchRunway(focusedBatchId) : null;
    const focusedOrg = focusedBatch ? Store.getOrg(focusedBatch.orgId) : null;

    const events = eventsByDate(orgFilter);
    const todayISO = toISODate(new Date());

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'cal-header';
    header.innerHTML = `
      <button type="button" class="cal-nav" data-dir="-1" aria-label="Previous month">&larr;</button>
      <h2>${pageRangeLabel(current, MONTHS_PER_PAGE)}</h2>
      <button type="button" class="cal-nav" data-dir="1" aria-label="Next month">&rarr;</button>
      <button type="button" class="cal-today">Today</button>
    `;
    container.appendChild(header);

    const page = document.createElement('div');
    page.className = 'cal-page';
    for (let i = 0; i < MONTHS_PER_PAGE; i++) {
      const monthDate = addMonths(current, i);
      page.appendChild(renderMonthBlock(monthDate, orgFilter, events, todayISO, runway, focusedOrg));
    }
    container.appendChild(page);

    header.querySelectorAll('.cal-nav').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.dir);
        current = addMonths(current, dir);
        render(orgFilter);
      });
    });
    header.querySelector('.cal-today').addEventListener('click', () => {
      current = startOfMonth(new Date());
      render(orgFilter);
    });
  }

  return {
    init(el, opts) {
      container = el;
      onClinicClick = (opts && opts.onClinicClick) || null;
      onBatchFocusChange = (opts && opts.onBatchFocusChange) || null;
    },
    refresh(orgFilter) {
      render(orgFilter);
    },
    goToMonthOf(dateISO) {
      const d = new Date(dateISO);
      current = startOfMonth(d);
    },
    setFocusedBatch(batchId) {
      focusedBatchId = batchId;
    },
    clearFocus() {
      focusedBatchId = null;
    },
    getFocusedBatch() {
      return focusedBatchId ? Store.getBatch(focusedBatchId) : null;
    },
  };
})();
