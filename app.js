const TEAM = Array.from({ length: 8 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: `Członek zespołu ${i + 1}`,
  role: i === 0 ? 'Lider zespołu' : 'Członek zespołu'
}));

const API = 'https://uxkmgwofnewrdcixjpku.supabase.co/functions/v1/team-a-api';
let teamPassword = '';
let events = [];
let holidays = [];
let offers = [];
let currentMonth = new Date();
currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

const $ = (id) => document.getElementById(id);
const lockScreen = $('lockScreen');
const appRoot = $('appRoot');
const eventDialog = $('eventDialog');
const holidayDialog = $('holidayDialog');
const offerDialog = $('offerDialog');

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
  return value ? parseDate(value).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function monthName(date) {
  const text = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function teamName(id) {
  return TEAM.find(p => p.id === id)?.name || (id === 'all' ? 'Cały zespół' : id || 'Cały zespół');
}

function daysInclusive(from, to) {
  return Math.floor((parseDate(to) - parseDate(from)) / 86400000) + 1;
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function flagForCountry(country = '') {
  const c = country.toLowerCase();
  if (c.includes('hiszp')) return '🇪🇸';
  if (c.includes('grecj')) return '🇬🇷';
  if (c.includes('marok')) return '🇲🇦';
  if (c.includes('włoch')) return '🇮🇹';
  if (c.includes('portug')) return '🇵🇹';
  if (c.includes('turcj')) return '🇹🇷';
  if (c.includes('cypr')) return '🇨🇾';
  return '✈️';
}

function money(value, currency = 'GBP') {
  if (value === null || value === undefined || value === '') return 'Sprawdź cenę';
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(0)}`;
  }
}

async function api(kind, method = 'GET', body = null, id = '') {
  const url = new URL(API);
  url.searchParams.set('kind', kind);
  if (id) url.searchParams.set('id', id);

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-team-password': teamPassword },
    body: body ? JSON.stringify(body) : undefined
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Nieprawidłowe hasło');
    throw new Error(json.error || `Błąd połączenia (${res.status})`);
  }
  return json.data ?? json;
}

async function unlock(password) {
  teamPassword = password;
  $('lockMessage').textContent = 'Sprawdzanie dostępu…';
  try {
    await api('events');
    lockScreen.hidden = true;
    appRoot.hidden = false;
    $('lockMessage').textContent = '';
    await loadAll();
  } catch (error) {
    teamPassword = '';
    $('lockMessage').textContent = error.message === 'Nieprawidłowe hasło'
      ? 'Nieprawidłowe hasło. Spróbuj ponownie.'
      : 'Nie udało się połączyć. Spróbuj ponownie.';
  }
}

async function loadAll() {
  $('dbStatus').textContent = 'Synchronizacja…';
  try {
    [events, holidays, offers] = await Promise.all([
      api('events'), api('holidays'), api('offers')
    ]);
    $('dbStatus').textContent = 'Połączono';
    renderAll();
  } catch (error) {
    $('dbStatus').textContent = 'Błąd połączenia';
    toast(error.message);
  }
}

function setOptions() {
  $('eventPerson').innerHTML = [
    '<option value="all">Cały zespół</option>',
    ...TEAM.map(p => `<option value="${p.id}">${p.name}</option>`)
  ].join('');
  $('holidayPerson').innerHTML = TEAM.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function renderTeam() {
  $('teamGrid').innerHTML = TEAM.map((person, index) => `
    <article class="member-card">
      <div class="avatar">${index + 1}</div>
      <div class="member-copy">
        <strong>${escapeHtml(person.name)}</strong>
        <small>${escapeHtml(person.role)}</small>
      </div>
      <span class="member-status">Aktywny</span>
    </article>
  `).join('');
}

function renderCalendar() {
  $('monthLabel').textContent = monthName(currentMonth);
  const grid = $('calendarGrid');
  grid.innerHTML = '';

  const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const today = ymd(new Date());

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = ymd(date);
    const dayEvents = events
      .filter(e => e.event_date === key)
      .sort((a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99'));

    const day = document.createElement('div');
    day.className = `day${date.getMonth() === currentMonth.getMonth() ? '' : ' muted'}${key === today ? ' today' : ''}`;
    day.innerHTML = `<div class="day-num">${date.getDate()}${key === today ? '<span>DZIŚ</span>' : ''}</div>`;

    dayEvents.slice(0, 3).forEach(event => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'event-chip';
      chip.innerHTML = `<strong>${escapeHtml(event.title)}</strong><span>${escapeHtml((event.event_time || 'Cały dzień').slice(0, 5))}</span>`;
      chip.addEventListener('click', () => openEvent(event));
      day.appendChild(chip);
    });

    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'more-events';
      more.textContent = `+ ${dayEvents.length - 3} więcej`;
      day.appendChild(more);
    }

    day.addEventListener('dblclick', () => openEvent({ event_date: key }));
    grid.appendChild(day);
  }
  renderUpcoming();
}

function renderUpcoming() {
  const today = ymd(new Date());
  const list = [...events]
    .filter(e => e.event_date >= today)
    .sort((a, b) => `${a.event_date} ${a.event_time || ''}`.localeCompare(`${b.event_date} ${b.event_time || ''}`))
    .slice(0, 10);

  $('upcomingList').innerHTML = list.length ? list.map(event => `
    <article class="event-item">
      <div class="date-badge">
        <strong>${parseDate(event.event_date).getDate()}</strong>
        <span>${parseDate(event.event_date).toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span>
      </div>
      <div class="event-copy">
        <div class="event-title">${escapeHtml(event.title)}</div>
        <div class="meta">${escapeHtml((event.event_time || 'Cały dzień').slice(0, 5))} · ${escapeHtml(teamName(event.person))}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</div>
      </div>
      <div class="row-actions">
        <button class="small-action" data-edit-event="${event.id}">Edytuj</button>
        <button class="delete" data-del-event="${event.id}" aria-label="Usuń wydarzenie">×</button>
      </div>
    </article>
  `).join('') : '<div class="empty"><strong>Brak nadchodzących wydarzeń</strong><span>Dodaj pierwsze wydarzenie do wspólnego kalendarza Team A.</span></div>';

  document.querySelectorAll('[data-edit-event]').forEach(button => {
    button.onclick = () => openEvent(events.find(e => e.id === button.dataset.editEvent));
  });
  document.querySelectorAll('[data-del-event]').forEach(button => {
    button.onclick = () => removeItem('events', button.dataset.delEvent, 'wydarzenie');
  });
}

function holidayStatus(holiday, today) {
  if (holiday.date_to < today) return ['Miniony', 'past'];
  if (holiday.date_from <= today && holiday.date_to >= today) return ['Trwa teraz', 'current'];
  return ['Nadchodzący', 'upcoming'];
}

function renderHolidays() {
  const today = ymd(new Date());
  const ordered = [...holidays].sort((a, b) => a.date_from.localeCompare(b.date_from));

  $('holidayCount').textContent = holidays.length;
  $('awayToday').textContent = holidays.filter(h => h.date_from <= today && h.date_to >= today).length;
  const next = ordered.find(h => h.date_from >= today);
  $('nextLeave').textContent = next ? Math.max(0, Math.ceil((parseDate(next.date_from) - parseDate(today)) / 86400000)) : '—';

  $('holidayList').innerHTML = ordered.length ? ordered.map(holiday => {
    const [label, cls] = holidayStatus(holiday, today);
    return `
      <div class="holiday-row">
        <span><strong>${escapeHtml(teamName(holiday.person))}</strong>${holiday.note ? `<div class="meta">${escapeHtml(holiday.note)}</div>` : ''}</span>
        <span>${prettyDate(holiday.date_from)}</span>
        <span>${prettyDate(holiday.date_to)}</span>
        <span>${daysInclusive(holiday.date_from, holiday.date_to)}</span>
        <span><span class="status ${cls}">${label}</span></span>
        <span class="row-actions"><button class="small-action" data-edit-holiday="${holiday.id}">Edytuj</button><button class="delete" data-del-holiday="${holiday.id}" aria-label="Usuń urlop">×</button></span>
      </div>
    `;
  }).join('') : '<div class="empty table-empty"><strong>Brak zapisanych urlopów</strong><span>Dodaj pierwszy urlop członka zespołu.</span></div>';

  document.querySelectorAll('[data-edit-holiday]').forEach(button => {
    button.onclick = () => openHoliday(holidays.find(h => h.id === button.dataset.editHoliday));
  });
  document.querySelectorAll('[data-del-holiday]').forEach(button => {
    button.onclick = () => removeItem('holidays', button.dataset.delHoliday, 'urlop');
  });
}

function renderOffers() {
  const ordered = [...offers].sort((a, b) => {
    const da = a.departure_date || '9999-12-31';
    const db = b.departure_date || '9999-12-31';
    return da.localeCompare(db) || (Number(a.price_per_person || 999999) - Number(b.price_per_person || 999999));
  });

  $('offerGrid').innerHTML = ordered.length ? ordered.map(offer => `
    <article class="offer-card">
      <div class="offer-visual">
        <span class="offer-flag">${flagForCountry(offer.country)}</span>
        <span class="offer-country">${escapeHtml(offer.country || 'Oferta wakacyjna')}</span>
        ${offer.board ? `<span class="offer-board">${escapeHtml(offer.board)}</span>` : ''}
      </div>
      <div class="offer-body">
        <div class="offer-head">
          <div><h3>${escapeHtml(offer.destination)}</h3><p class="offer-date">${offer.departure_date ? `Wylot ${prettyDate(offer.departure_date)}` : 'Termin do ustalenia'}</p></div>
          <div class="price-block"><strong>${money(offer.price_per_person, offer.currency || 'GBP')}</strong><span>${offer.price_per_person != null ? 'za osobę' : 'aktualna cena'}</span></div>
        </div>
        <div class="offer-details">
          ${offer.nights ? `<span>🌙 <strong>${offer.nights}</strong> nocy</span>` : ''}
          ${offer.departure_airport ? `<span>✈️ ${escapeHtml(offer.departure_airport)}</span>` : ''}
          ${offer.board ? `<span>🍽️ ${escapeHtml(offer.board)}</span>` : ''}
        </div>
        ${offer.notes ? `<p class="offer-notes">${escapeHtml(offer.notes)}</p>` : ''}
        <div class="offer-actions">
          <a class="btn primary offer-link" href="${escapeHtml(offer.url)}" target="_blank" rel="noopener">Zobacz ofertę ↗</a>
          <button class="btn secondary" data-edit-offer="${offer.id}">Edytuj</button>
          <button class="btn danger" data-del-offer="${offer.id}">Usuń</button>
        </div>
      </div>
    </article>
  `).join('') : '<div class="empty offer-empty"><strong>Brak ofert wakacyjnych</strong><span>Dodaj pierwszą ofertę, aby cały zespół mógł ją porównać.</span></div>';

  document.querySelectorAll('[data-edit-offer]').forEach(button => {
    button.onclick = () => openOffer(offers.find(o => o.id === button.dataset.editOffer));
  });
  document.querySelectorAll('[data-del-offer]').forEach(button => {
    button.onclick = () => removeItem('offers', button.dataset.delOffer, 'ofertę');
  });
}

function renderAll() {
  renderCalendar();
  renderHolidays();
  renderOffers();
  renderTeam();
}

function openEvent(event = {}) {
  $('eventForm').reset();
  $('eventId').value = event.id || '';
  $('eventDialogTitle').textContent = event.id ? 'Edytuj wydarzenie' : 'Dodaj wydarzenie';
  $('eventTitle').value = event.title || '';
  $('eventDate').value = event.event_date || ymd(new Date());
  $('eventTime').value = (event.event_time || '').slice(0, 5);
  $('eventPerson').value = event.person || 'all';
  $('eventNotes').value = event.notes || '';
  eventDialog.showModal();
}

function openHoliday(holiday = {}) {
  $('holidayForm').reset();
  $('holidayId').value = holiday.id || '';
  $('holidayDialogTitle').textContent = holiday.id ? 'Edytuj urlop' : 'Dodaj urlop';
  const today = ymd(new Date());
  $('holidayPerson').value = holiday.person || TEAM[0].id;
  $('holidayFrom').value = holiday.date_from || today;
  $('holidayTo').value = holiday.date_to || today;
  $('holidayNote').value = holiday.note || '';
  holidayDialog.showModal();
}

function openOffer(offer = {}) {
  $('offerForm').reset();
  $('offerId').value = offer.id || '';
  $('offerDialogTitle').textContent = offer.id ? 'Edytuj ofertę' : 'Dodaj ofertę';
  $('offerCountry').value = offer.country || '';
  $('offerDestination').value = offer.destination || '';
  $('offerPrice').value = offer.price_per_person ?? '';
  $('offerCurrency').value = offer.currency || 'GBP';
  $('offerDate').value = offer.departure_date || '';
  $('offerNights').value = offer.nights || 7;
  $('offerBoard').value = offer.board || '';
  $('offerAirport').value = offer.departure_airport || '';
  $('offerUrl').value = offer.url || '';
  $('offerNotes').value = offer.notes || '';
  offerDialog.showModal();
}

async function removeItem(kind, id, label = 'element') {
  if (!confirm(`Czy na pewno chcesz usunąć ${label}?`)) return;
  try {
    await api(kind, 'DELETE', null, id);
    await loadAll();
    toast('Usunięto pomyślnie');
  } catch (error) {
    toast(error.message);
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab));
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));

  const titles = {
    calendar: ['Kalendarz', 'Wspólny harmonogram wydarzeń zespołu'],
    holiday: ['Urlopy', 'Planowanie urlopów i nieobecności Team A'],
    offers: ['Oferty wakacyjne', 'Wspólna lista propozycji wyjazdów dla zespołu'],
    team: ['Zespół', '8 osób w jednej wspólnej przestrzeni roboczej']
  };
  $('pageTitle').textContent = titles[tab][0];
  $('pageSubtitle').textContent = titles[tab][1];

  const action = $('primaryAction');
  if (tab === 'calendar') {
    action.hidden = false;
    action.textContent = '+ Dodaj wydarzenie';
    action.onclick = () => openEvent();
  } else if (tab === 'holiday') {
    action.hidden = false;
    action.textContent = '+ Dodaj urlop';
    action.onclick = () => openHoliday();
  } else if (tab === 'offers') {
    action.hidden = false;
    action.textContent = '+ Dodaj ofertę';
    action.onclick = () => openOffer();
  } else {
    action.hidden = true;
  }
}

document.querySelectorAll('.nav-item').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());

$('prevMonth').onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
};
$('nextMonth').onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
};
$('todayBtn').onclick = () => {
  const now = new Date();
  currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  renderCalendar();
};

$('addHolidayBtn').onclick = () => openHoliday();
$('addOfferBtn').onclick = () => openOffer();
$('lockBtn').onclick = () => {
  teamPassword = '';
  appRoot.hidden = true;
  lockScreen.hidden = false;
  $('teamPassword').value = '';
  $('teamPassword').focus();
};

$('lockForm').addEventListener('submit', event => {
  event.preventDefault();
  unlock($('teamPassword').value);
});

$('eventForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('eventId').value;
  const body = {
    title: $('eventTitle').value.trim(),
    event_date: $('eventDate').value,
    event_time: $('eventTime').value,
    person: $('eventPerson').value,
    notes: $('eventNotes').value.trim()
  };
  try {
    await api('events', id ? 'PATCH' : 'POST', body, id);
    eventDialog.close();
    await loadAll();
    toast(id ? 'Wydarzenie zaktualizowane' : 'Wydarzenie dodane');
  } catch (error) {
    toast(error.message);
  }
});

$('holidayForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('holidayId').value;
  const from = $('holidayFrom').value;
  const to = $('holidayTo').value;
  if (to < from) {
    toast('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia');
    return;
  }
  const body = {
    person: $('holidayPerson').value,
    date_from: from,
    date_to: to,
    note: $('holidayNote').value.trim()
  };
  try {
    await api('holidays', id ? 'PATCH' : 'POST', body, id);
    holidayDialog.close();
    await loadAll();
    toast(id ? 'Urlop zaktualizowany' : 'Urlop dodany');
  } catch (error) {
    toast(error.message);
  }
});

$('offerForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('offerId').value;
  const body = {
    country: $('offerCountry').value.trim(),
    destination: $('offerDestination').value.trim(),
    price_per_person: $('offerPrice').value,
    currency: $('offerCurrency').value,
    departure_date: $('offerDate').value,
    nights: $('offerNights').value,
    board: $('offerBoard').value.trim(),
    departure_airport: $('offerAirport').value.trim(),
    url: $('offerUrl').value.trim(),
    notes: $('offerNotes').value.trim()
  };
  try {
    await api('offers', id ? 'PATCH' : 'POST', body, id);
    offerDialog.close();
    await loadAll();
    toast(id ? 'Oferta zaktualizowana' : 'Oferta dodana');
  } catch (error) {
    toast(error.message);
  }
});

setOptions();
renderTeam();
switchTab('calendar');
