const TEAM = Array.from({ length: 8 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: `Team Member ${i + 1}`,
  role: i === 0 ? 'Team lead' : 'Team member'
}));

const STORE_EVENTS = 'teama2-events-v1';
const STORE_HOLIDAYS = 'teama2-holidays-v1';

let events = load(STORE_EVENTS);
let holidays = load(STORE_HOLIDAYS);
let currentMonth = new Date();
currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

const $ = (id) => document.getElementById(id);
const calendarGrid = $('calendarGrid');
const monthLabel = $('monthLabel');
const upcomingList = $('upcomingList');
const holidayList = $('holidayList');
const teamGrid = $('teamGrid');
const eventDialog = $('eventDialog');
const holidayDialog = $('holidayDialog');

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORE_EVENTS, JSON.stringify(events));
  localStorage.setItem(STORE_HOLIDAYS, JSON.stringify(holidays));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function prettyDate(value) {
  return parseDate(value).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function teamName(id) {
  return TEAM.find((person) => person.id === id)?.name || 'All team';
}

function daysInclusive(from, to) {
  const ms = parseDate(to) - parseDate(from);
  return Math.floor(ms / 86400000) + 1;
}

function setOptions() {
  const eventOptions = ['<option value="all">All team</option>']
    .concat(TEAM.map(p => `<option value="${p.id}">${p.name}</option>`));
  $('eventPerson').innerHTML = eventOptions.join('');
  $('holidayPerson').innerHTML = TEAM.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function renderTeam() {
  teamGrid.innerHTML = TEAM.map((person, index) => {
    const initials = person.name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
    return `<article class="member-card">
      <div class="avatar">${initials}</div>
      <div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)} · #${index + 1}</small></div>
    </article>`;
  }).join('');
}

function renderCalendar() {
  monthLabel.textContent = currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  calendarGrid.innerHTML = '';

  const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  const today = ymd(new Date());

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateKey = ymd(date);
    const inMonth = date.getMonth() === currentMonth.getMonth();
    const dayEvents = events
      .filter(event => event.date === dateKey)
      .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    const day = document.createElement('div');
    day.className = `day${inMonth ? '' : ' muted'}${dateKey === today ? ' today' : ''}`;
    day.innerHTML = `<div class="day-num">${date.getDate()}</div>`;

    dayEvents.slice(0, 3).forEach(event => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'event-chip';
      chip.title = [event.title, event.time, teamName(event.person), event.notes].filter(Boolean).join(' · ');
      chip.innerHTML = `<strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.time || 'All day')}</span>`;
      chip.addEventListener('click', () => {
        if (confirm(`Delete event: ${event.title}?`)) {
          events = events.filter(item => item.id !== event.id);
          save();
          renderAll();
        }
      });
      day.appendChild(chip);
    });

    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'meta';
      more.textContent = `+${dayEvents.length - 3} more`;
      day.appendChild(more);
    }

    day.addEventListener('dblclick', () => openEvent(dateKey));
    calendarGrid.appendChild(day);
  }

  renderUpcoming();
}

function renderUpcoming() {
  const today = ymd(new Date());
  const future = [...events]
    .filter(event => event.date >= today)
    .sort((a, b) => `${a.date} ${a.time || '99:99'}`.localeCompare(`${b.date} ${b.time || '99:99'}`))
    .slice(0, 8);

  if (!future.length) {
    upcomingList.innerHTML = '<div class="empty">No upcoming events yet. Add the first Team A event.</div>';
    return;
  }

  upcomingList.innerHTML = future.map(event => {
    const date = parseDate(event.date);
    const month = date.toLocaleDateString('en-GB', { month: 'short' });
    return `<article class="event-item">
      <div class="date-badge"><strong>${date.getDate()}</strong><span>${month}</span></div>
      <div>
        <div class="event-title">${escapeHtml(event.title)}</div>
        <div class="meta">${escapeHtml(event.time || 'All day')} · ${escapeHtml(teamName(event.person))}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</div>
      </div>
      <button class="delete" data-event-delete="${event.id}" aria-label="Delete event">×</button>
    </article>`;
  }).join('');

  upcomingList.querySelectorAll('[data-event-delete]').forEach(button => {
    button.addEventListener('click', () => {
      events = events.filter(event => event.id !== button.dataset.eventDelete);
      save();
      renderAll();
    });
  });
}

function holidayStatus(entry, today) {
  if (entry.to < today) return ['Past', 'past'];
  if (entry.from <= today && entry.to >= today) return ['Away now', 'current'];
  return ['Upcoming', 'upcoming'];
}

function renderHolidays() {
  const today = ymd(new Date());
  const ordered = [...holidays].sort((a, b) => a.from.localeCompare(b.from));

  $('holidayCount').textContent = holidays.length;
  $('awayToday').textContent = holidays.filter(h => h.from <= today && h.to >= today).length;

  const next = ordered.find(h => h.from >= today);
  if (next) {
    const diff = Math.ceil((parseDate(next.from) - parseDate(today)) / 86400000);
    $('nextLeave').textContent = String(Math.max(0, diff));
  } else {
    $('nextLeave').textContent = '—';
  }

  if (!ordered.length) {
    holidayList.innerHTML = '<div class="empty" style="margin:14px">No holiday added yet.</div>';
    return;
  }

  holidayList.innerHTML = ordered.map(entry => {
    const [label, className] = holidayStatus(entry, today);
    return `<div class="holiday-row">
      <span><strong>${escapeHtml(teamName(entry.person))}</strong>${entry.note ? `<div class="meta">${escapeHtml(entry.note)}</div>` : ''}</span>
      <span>${prettyDate(entry.from)}</span>
      <span>${prettyDate(entry.to)}</span>
      <span>${daysInclusive(entry.from, entry.to)}</span>
      <span><span class="status ${className}">${label}</span></span>
      <button class="delete" data-holiday-delete="${entry.id}" aria-label="Delete holiday">×</button>
    </div>`;
  }).join('');

  holidayList.querySelectorAll('[data-holiday-delete]').forEach(button => {
    button.addEventListener('click', () => {
      holidays = holidays.filter(entry => entry.id !== button.dataset.holidayDelete);
      save();
      renderAll();
    });
  });
}

function renderAll() {
  renderCalendar();
  renderHolidays();
  renderTeam();
}

function openEvent(dateValue) {
  $('eventForm').reset();
  $('eventDate').value = dateValue || ymd(new Date());
  eventDialog.showModal();
  setTimeout(() => $('eventTitle').focus(), 0);
}

function openHoliday() {
  $('holidayForm').reset();
  const today = ymd(new Date());
  $('holidayFrom').value = today;
  $('holidayTo').value = today;
  holidayDialog.showModal();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));

  const titleMap = { calendar: 'Calendar', holiday: 'Holiday', team: 'Team' };
  $('pageTitle').textContent = titleMap[tab];
  const action = $('primaryAction');
  if (tab === 'calendar') {
    action.style.display = '';
    action.textContent = '+ Add event';
    action.onclick = () => openEvent();
  } else if (tab === 'holiday') {
    action.style.display = '';
    action.textContent = '+ Add holiday';
    action.onclick = openHoliday;
  } else {
    action.style.display = 'none';
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

document.querySelectorAll('.nav-item').forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => $(button.dataset.close).close());
});

$('prevMonth').addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
});

$('nextMonth').addEventListener('click', () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
});

$('todayBtn').addEventListener('click', () => {
  const now = new Date();
  currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
});

$('addHolidayBtn').addEventListener('click', openHoliday);
$('primaryAction').addEventListener('click', () => openEvent());

$('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('eventTitle').value.trim();
  const date = $('eventDate').value;
  if (!title || !date) return;

  events.push({
    id: uid('event'),
    title,
    date,
    time: $('eventTime').value,
    person: $('eventPerson').value,
    notes: $('eventNotes').value.trim()
  });
  save();
  eventDialog.close();
  currentMonth = new Date(parseDate(date).getFullYear(), parseDate(date).getMonth(), 1);
  renderAll();
});

$('holidayForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const from = $('holidayFrom').value;
  const to = $('holidayTo').value;
  if (!from || !to) return;
  if (to < from) {
    alert('The end date cannot be before the start date.');
    return;
  }

  holidays.push({
    id: uid('holiday'),
    person: $('holidayPerson').value,
    from,
    to,
    note: $('holidayNote').value.trim()
  });
  save();
  holidayDialog.close();
  renderAll();
});

setOptions();
renderAll();
switchTab('calendar');
