const TEAM = Array.from({ length: 8 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: `Członek ${String(i + 1).padStart(2, '0')}`,
  role: 'Przedsiębiorca'
}));

const API = 'https://uxkmgwofnewrdcixjpku.supabase.co/functions/v1/team-a-api';
let teamPassword = '';
let events = [];
let offers = [];
let activeCountry = 'Wszystkie';
let currentMonth = new Date();
let syncTimer = null;
currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

const $ = (id) => document.getElementById(id);
const lockScreen = $('lockScreen');
const appRoot = $('appRoot');
const eventDialog = $('eventDialog');
const offerDialog = $('offerDialog');

function icon(id, cls = '') {
  return `<svg class="${cls}"><use href="#${id}"/></svg>`;
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
function formatDate(value) {
  return value ? parseDate(value).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}
function monthName(date) {
  const text = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function displayTime(value) {
  return value ? value.slice(0, 5) : 'Cały dzień';
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function teamName(id) {
  return TEAM.find(p => p.id === id)?.name || (id === 'all' ? 'Cały zespół' : id || 'Cały zespół');
}
function money(value, currency = 'GBP') {
  if (value === null || value === undefined || value === '') return 'Sprawdź cenę';
  const n = Number(value);
  const symbols = { GBP: '£', EUR: '€', USD: '$' };
  return `${symbols[currency] || `${currency} `}${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(n)}`;
}
function tripRange(value, nights) {
  if (!value) return 'Termin do ustalenia';
  const start = parseDate(value);
  const end = new Date(start);
  end.setDate(start.getDate() + Number(nights || 0));
  if (!nights) return formatDate(value);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}`;
  return `${start.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2300);
}

async function api(kind, method = 'GET', body = null, id = '') {
  const url = new URL(API);
  url.searchParams.set('kind', kind);
  if (id) url.searchParams.set('id', id);
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-team-password': teamPassword },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error('Nieprawidłowe hasło');
    throw new Error(json.error || 'Nie udało się połączyć');
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
    switchTab('overview');
    clearInterval(syncTimer);
    syncTimer = setInterval(() => loadAll(true), 30000);
  } catch (error) {
    teamPassword = '';
    $('lockMessage').textContent = error.message === 'Nieprawidłowe hasło'
      ? 'Nieprawidłowe hasło. Spróbuj ponownie.'
      : 'Nie udało się połączyć. Spróbuj ponownie.';
  }
}

async function loadAll(silent = false) {
  if (!silent) $('dbStatus').textContent = 'Synchronizacja…';
  try {
    [events, offers] = await Promise.all([api('events'), api('offers')]);
    $('dbStatus').textContent = 'Baza online';
    renderAll();
  } catch (error) {
    $('dbStatus').textContent = 'Brak połączenia';
    if (!silent) toast(error.message);
  }
}

function setOptions() {
  $('eventPerson').innerHTML = ['<option value="all">Cały zespół</option>', ...TEAM.map(p => `<option value="${p.id}">${p.name}</option>`)].join('');
}

function getFutureEvents() {
  const today = ymd(new Date());
  return [...events]
    .filter(e => e.event_date >= today)
    .sort((a, b) => `${a.event_date} ${a.event_time || '99:99'}`.localeCompare(`${b.event_date} ${b.event_time || '99:99'}`));
}

function renderOverview() {
  const future = getFutureEvents();
  const next = future[0];
  $('todayLabel').textContent = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  $('summaryEvent').textContent = next ? next.title : 'Brak wydarzeń';
  $('summaryEventMeta').textContent = next ? `${formatDate(next.event_date)} · ${displayTime(next.event_time)}` : 'Dodaj pierwszy termin';
  $('summaryTrips').textContent = offers.length;
  const priced = offers.map(o => Number(o.price_per_person)).filter(n => Number.isFinite(n) && n > 0);
  $('summaryPrice').textContent = priced.length ? `£${Math.min(...priced).toFixed(0)}` : '—';

  $('overviewEvents').innerHTML = future.length
    ? future.slice(0, 5).map(event => {
        const date = parseDate(event.event_date);
        return `<article class="timeline-item">
          <div class="timeline-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span></div>
          <div class="timeline-copy"><strong>${escapeHtml(event.title)}</strong><span>${displayTime(event.event_time)}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</span></div>
        </article>`;
      }).join('')
    : '<div class="quiet-empty">Brak zaplanowanych wydarzeń.</div>';

  const trips = [...offers].sort((a, b) => (a.departure_date || '9999').localeCompare(b.departure_date || '9999')).slice(0, 3);
  $('overviewTrips').innerHTML = trips.length
    ? trips.map(offer => `<article class="compact-trip">
        <div><span>${escapeHtml((offer.country || 'Wyjazd').toUpperCase())}</span><strong>${escapeHtml(offer.destination)}</strong><small>${tripRange(offer.departure_date, offer.nights)}</small></div>
        <div class="compact-trip-right"><strong>${money(offer.price_per_person, offer.currency || 'GBP')}</strong><a href="${escapeHtml(offer.url)}" target="_blank" rel="noopener" aria-label="Zobacz ofertę">${icon('i-external')}</a></div>
      </article>`).join('')
    : '<div class="quiet-empty">Brak zapisanych wyjazdów.</div>';
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
    const dayEvents = events.filter(e => e.event_date === key).sort((a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99'));
    const day = document.createElement('div');
    day.className = `day${date.getMonth() === currentMonth.getMonth() ? '' : ' muted'}${key === today ? ' today' : ''}`;
    day.innerHTML = `<div class="day-number">${date.getDate()}${key === today ? '<span>DZIŚ</span>' : ''}</div>`;
    dayEvents.slice(0, 3).forEach(event => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'event-chip';
      chip.innerHTML = `<strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(displayTime(event.event_time))}</span>`;
      chip.addEventListener('click', () => openEvent(event));
      day.appendChild(chip);
    });
    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'more-events';
      more.textContent = `+${dayEvents.length - 3} więcej`;
      day.appendChild(more);
    }
    day.addEventListener('dblclick', () => openEvent({ event_date: key }));
    grid.appendChild(day);
  }
  renderUpcoming();
}

function renderUpcoming() {
  const list = getFutureEvents().slice(0, 10);
  $('upcomingList').innerHTML = list.length
    ? list.map(event => {
        const date = parseDate(event.event_date);
        return `<article class="event-item">
          <div class="event-date"><strong>${date.getDate()}</strong><span>${date.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span></div>
          <div class="event-copy"><strong>${escapeHtml(event.title)}</strong><span>${displayTime(event.event_time)} · ${escapeHtml(teamName(event.person))}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</span></div>
          <div class="event-actions"><button class="small-btn" data-edit-event="${event.id}">${icon('i-edit')}Edytuj</button><button class="icon-btn danger-icon" data-del-event="${event.id}" aria-label="Usuń wydarzenie">${icon('i-trash')}</button></div>
        </article>`;
      }).join('')
    : '<div class="quiet-empty bordered">Brak nadchodzących wydarzeń.</div>';
  document.querySelectorAll('[data-edit-event]').forEach(button => button.onclick = () => openEvent(events.find(e => e.id === button.dataset.editEvent)));
  document.querySelectorAll('[data-del-event]').forEach(button => button.onclick = () => removeItem('events', button.dataset.delEvent, 'wydarzenie'));
}

function buildCountryFilters() {
  const countries = ['Wszystkie', ...new Set(offers.map(o => o.country).filter(Boolean))];
  if (!countries.includes(activeCountry)) activeCountry = 'Wszystkie';
  $('countryFilters').innerHTML = countries.map(country => `<button class="filter-btn${country === activeCountry ? ' active' : ''}" data-country="${escapeHtml(country)}">${escapeHtml(country)}</button>`).join('');
  $('countryFilters').querySelectorAll('[data-country]').forEach(button => {
    button.onclick = () => { activeCountry = button.dataset.country; renderOffers(); };
  });
}

function renderOffers() {
  buildCountryFilters();
  const sort = $('offerSort').value;
  let visible = offers.filter(o => activeCountry === 'Wszystkie' || o.country === activeCountry);
  visible = [...visible].sort((a, b) => {
    if (sort === 'price') return Number(a.price_per_person || 999999) - Number(b.price_per_person || 999999);
    if (sort === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    return (a.departure_date || '9999-12-31').localeCompare(b.departure_date || '9999-12-31');
  });

  const priced = offers.map(o => Number(o.price_per_person)).filter(n => Number.isFinite(n) && n > 0);
  const dated = offers.map(o => o.departure_date).filter(Boolean).sort();
  $('tripCount').textContent = `${offers.length} ${offers.length === 1 ? 'oferta' : offers.length < 5 ? 'oferty' : 'ofert'}`;
  $('tripLowest').textContent = priced.length ? `£${Math.min(...priced).toFixed(0)} / os.` : '—';
  $('tripSoonest').textContent = dated.length ? formatDate(dated[0]) : '—';

  $('offerGrid').innerHTML = visible.length
    ? visible.map(offer => `<article class="offer-card">
        <div class="offer-topline"><span>${escapeHtml((offer.country || 'WYJAZD').toUpperCase())}</span><details class="more-menu"><summary aria-label="Więcej opcji">${icon('i-more')}</summary><div class="menu-popover"><button data-edit-offer="${offer.id}">${icon('i-edit')}Edytuj</button><button class="menu-danger" data-del-offer="${offer.id}">${icon('i-trash')}Usuń ofertę</button></div></details></div>
        <div class="offer-main"><div><h3>${escapeHtml(offer.destination)}</h3><p>${tripRange(offer.departure_date, offer.nights)}${offer.nights ? ` · ${offer.nights} nocy` : ''}</p></div><div class="offer-price"><span>${offer.price_per_person != null ? 'około' : ''}</span><strong>${money(offer.price_per_person, offer.currency || 'GBP')}</strong><small>${offer.price_per_person != null ? '/ osoba' : 'aktualna cena'}</small></div></div>
        <div class="offer-info">${offer.board ? `<span>${escapeHtml(offer.board)}</span>` : ''}${offer.departure_airport ? `<span>${escapeHtml(offer.departure_airport)}</span>` : ''}</div>
        ${offer.notes ? `<p class="offer-notes">${escapeHtml(offer.notes)}</p>` : ''}
        <div class="offer-footer"><a class="btn btn-dark" href="${escapeHtml(offer.url)}" target="_blank" rel="noopener">Zobacz ofertę ${icon('i-external')}</a></div>
      </article>`).join('')
    : '<div class="quiet-empty bordered offer-empty">Brak ofert w tym widoku.</div>';

  document.querySelectorAll('[data-edit-offer]').forEach(button => button.onclick = () => openOffer(offers.find(o => o.id === button.dataset.editOffer)));
  document.querySelectorAll('[data-del-offer]').forEach(button => button.onclick = () => removeItem('offers', button.dataset.delOffer, 'ofertę'));
}

function renderTeam() {
  $('teamGrid').innerHTML = TEAM.map((person, index) => `<article class="member-card">
    <div class="member-avatar">${String(index + 1).padStart(2, '0')}</div>
    <div><span>TEAM A</span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)}</small></div>
  </article>`).join('');
}

function renderAll() {
  renderOverview();
  renderCalendar();
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

function openOffer(offer = {}) {
  $('offerForm').reset();
  $('offerId').value = offer.id || '';
  $('offerDialogTitle').textContent = offer.id ? 'Edytuj wyjazd' : 'Dodaj wyjazd';
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
    toast('✓ Usunięto');
  } catch (error) {
    toast(error.message);
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === tab));
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  const titles = {
    overview: ['Pulpit', 'Wspólna przestrzeń do planowania tego, co ważne.'],
    calendar: ['Kalendarz', 'Wspólny harmonogram wydarzeń Team A.'],
    offers: ['Wyjazdy', 'Pomysły i oferty, które rozważamy jako Team A.'],
    team: ['Zespół', '8 osób. Jedna przestrzeń.']
  };
  $('pageTitle').textContent = titles[tab][0];
  $('pageSubtitle').textContent = titles[tab][1];
  const action = $('primaryAction');
  if (tab === 'calendar') {
    action.hidden = false;
    action.innerHTML = `${icon('i-plus')}<span>Dodaj wydarzenie</span>`;
    action.onclick = () => openEvent();
  } else if (tab === 'offers') {
    action.hidden = false;
    action.innerHTML = `${icon('i-plus')}<span>Dodaj wyjazd</span>`;
    action.onclick = () => openOffer();
  } else {
    action.hidden = true;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(button => button.onclick = () => switchTab(button.dataset.tab));
document.querySelectorAll('[data-go]').forEach(button => button.onclick = () => switchTab(button.dataset.go));
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
$('prevMonth').onclick = () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1); renderCalendar(); };
$('nextMonth').onclick = () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1); renderCalendar(); };
$('todayBtn').onclick = () => { const now = new Date(); currentMonth = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); };
$('offerSort').onchange = renderOffers;
$('lockBtn').onclick = () => {
  teamPassword = '';
  clearInterval(syncTimer);
  appRoot.hidden = true;
  lockScreen.hidden = false;
  $('teamPassword').value = '';
  $('teamPassword').focus();
};

$('lockForm').addEventListener('submit', event => { event.preventDefault(); unlock($('teamPassword').value); });
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
    toast('✓ Zapisano');
  } catch (error) { toast(error.message); }
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
    toast('✓ Zapisano');
  } catch (error) { toast(error.message); }
});

setOptions();
renderTeam();
switchTab('overview');
