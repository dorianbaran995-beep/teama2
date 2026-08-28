const TEAM = Array.from({ length: 8 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: `Członek ${String(i + 1).padStart(2, '0')}`,
  role: 'Przedsiębiorca'
}));

const API = 'https://uxkmgwofnewrdcixjpku.supabase.co/functions/v1/team-a-api';

let teamPassword = '';
let events = [];
let offers = [];
let santa = [];
let activeCountry = 'Wszystkie';
let currentMonth = new Date();
let syncTimer = null;
currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

const $ = id => document.getElementById(id);
const lockScreen = $('lockScreen');
const appRoot = $('appRoot');
const eventDialog = $('eventDialog');
const offerDialog = $('offerDialog');

function icon(id, cls = '') {
  return `<svg class="${cls}"><use href="#${id}"/></svg>`;
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDate(value) {
  return value ? parseDate(value).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
}
function monthName(date) {
  const t = date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function displayTime(value) {
  return value ? value.slice(0, 5) : 'Cały dzień';
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}
function teamName(id) {
  return TEAM.find(p => p.id === id)?.name || (id === 'all' ? 'Cały zespół' : id || 'Cały zespół');
}
function money(value, currency = 'GBP') {
  if (value === null || value === undefined || value === '') return 'Sprawdź cenę';
  const symbols = { GBP: '£', EUR: '€', USD: '$' };
  return `${symbols[currency] || currency + ' '}${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Number(value))}`;
}
function tripRange(value, nights) {
  if (!value) return 'Termin do ustalenia';
  const start = parseDate(value);
  const end = new Date(start);
  end.setDate(start.getDate() + Number(nights || 0));
  if (!nights) return formatDate(value);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}`;
  }
  return `${start.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
function toast(message) {
  const el = $('toast');
  if (!el) return;
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
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-team-password': teamPassword.trim()
    },
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
  const clean = String(password || '').trim();
  const message = $('lockMessage');
  const button = $('loginButton');
  const passwordInput = $('teamPassword');

  if (!clean) {
    if (message) message.textContent = 'Wpisz hasło 🙂';
    return;
  }

  teamPassword = clean;
  if (message) message.textContent = 'Sprawdzam, czy jesteś swój…';
  if (button) {
    button.disabled = true;
    button.textContent = 'Chwila…';
  }

  let success = false;

  try {
    await api('events');
    await loadAll(true);

    if (appRoot) {
      appRoot.hidden = false;
      appRoot.removeAttribute('hidden');
      appRoot.style.display = 'grid';
      appRoot.style.minHeight = '100vh';
    }

    switchTab('overview');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    clearInterval(syncTimer);
    syncTimer = setInterval(() => loadAll(true), 30000);
    success = true;
  } catch (error) {
    teamPassword = '';
    if (message) {
      message.textContent = error.message === 'Nieprawidłowe hasło'
        ? 'Nope 😅 To nie jest hasło Team A.'
        : 'Nie udało się połączyć. Spróbuj ponownie.';
    }
    if (passwordInput) passwordInput.select();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Wchodzę →';
    }

    if (success && lockScreen) {
      lockScreen.style.setProperty('display', 'none', 'important');
      lockScreen.setAttribute('aria-hidden', 'true');
      requestAnimationFrame(() => {
        lockScreen.remove();
        window.scrollTo(0, 0);
      });
    }
  }
}

async function loadAll(silent = false) {
  if (!silent && $('dbStatus')) $('dbStatus').textContent = 'Synchronizacja…';
  try {
    [events, offers, santa] = await Promise.all([
      api('events'),
      api('offers'),
      api('santa')
    ]);
    if ($('dbStatus')) $('dbStatus').textContent = 'Baza online';
    renderAll();
  } catch (error) {
    if ($('dbStatus')) $('dbStatus').textContent = 'Brak połączenia';
    if (!silent) toast(error.message);
    throw error;
  }
}

function setOptions() {
  const el = $('eventPerson');
  if (!el) return;
  el.innerHTML = [
    '<option value="all">Cały zespół</option>',
    ...TEAM.map(p => `<option value="${p.id}">${p.name}</option>`)
  ].join('');
}
function getFutureEvents() {
  const today = ymd(new Date());
  return [...events]
    .filter(e => e.event_date >= today)
    .sort((a, b) => `${a.event_date} ${a.event_time || '99:99'}`.localeCompare(`${b.event_date} ${b.event_time || '99:99'}`));
}
function santaReadyCount() {
  return santa.filter(p => p.name && p.email).length;
}

function renderOverview() {
  const future = getFutureEvents();
  const next = future[0];
  if ($('todayLabel')) $('todayLabel').textContent = new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
  if ($('summaryEvent')) $('summaryEvent').textContent = next ? next.title : 'Brak wydarzeń';
  if ($('summaryEventMeta')) $('summaryEventMeta').textContent = next ? `${formatDate(next.event_date)} · ${displayTime(next.event_time)}` : 'Dodaj pierwszy termin';
  if ($('summaryTrips')) $('summaryTrips').textContent = offers.length;
  if ($('summarySanta')) $('summarySanta').textContent = `${santaReadyCount()}/8`;

  const overviewEvents = $('overviewEvents');
  if (overviewEvents) {
    overviewEvents.innerHTML = future.length
      ? future.slice(0, 5).map(event => {
          const d = parseDate(event.event_date);
          return `<article class="timeline-item"><div class="timeline-date"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span></div><div class="timeline-copy"><strong>${escapeHtml(event.title)}</strong><span>${displayTime(event.event_time)}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</span></div></article>`;
        }).join('')
      : '<div class="quiet-empty">Brak zaplanowanych wydarzeń.</div>';
  }

  const overviewTrips = $('overviewTrips');
  if (overviewTrips) {
    const trips = [...offers].sort((a, b) => (a.departure_date || '9999').localeCompare(b.departure_date || '9999')).slice(0, 3);
    overviewTrips.innerHTML = trips.length
      ? trips.map(o => `<article class="compact-trip"><div><span>${escapeHtml((o.country || 'Wyjazd').toUpperCase())}</span><strong>${escapeHtml(o.destination)}</strong><small>${tripRange(o.departure_date, o.nights)}</small></div><div class="compact-trip-right"><strong>${money(o.price_per_person, o.currency || 'GBP')}</strong><a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${icon('i-external')}</a></div></article>`).join('')
      : '<div class="quiet-empty">Brak zapisanych wyjazdów.</div>';
  }
}

function renderCalendar() {
  if (!$('calendarGrid') || !$('monthLabel')) return;
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
      chip.onclick = () => openEvent(event);
      day.appendChild(chip);
    });

    if (dayEvents.length > 3) {
      const more = document.createElement('div');
      more.className = 'more-events';
      more.textContent = `+${dayEvents.length - 3} więcej`;
      day.appendChild(more);
    }

    day.ondblclick = () => openEvent({ event_date: key });
    grid.appendChild(day);
  }

  renderUpcoming();
}

function renderUpcoming() {
  const target = $('upcomingList');
  if (!target) return;
  const list = getFutureEvents().slice(0, 10);
  target.innerHTML = list.length
    ? list.map(event => {
        const d = parseDate(event.event_date);
        return `<article class="event-item"><div class="event-date"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')}</span></div><div class="event-copy"><strong>${escapeHtml(event.title)}</strong><span>${displayTime(event.event_time)} · ${escapeHtml(teamName(event.person))}${event.notes ? ` · ${escapeHtml(event.notes)}` : ''}</span></div><div class="event-actions"><button class="small-btn" data-edit-event="${event.id}">${icon('i-edit')}Edytuj</button><button class="icon-btn danger-icon" data-del-event="${event.id}">${icon('i-trash')}</button></div></article>`;
      }).join('')
    : '<div class="quiet-empty bordered">Brak nadchodzących wydarzeń.</div>';

  document.querySelectorAll('[data-edit-event]').forEach(b => b.onclick = () => openEvent(events.find(e => e.id === b.dataset.editEvent)));
  document.querySelectorAll('[data-del-event]').forEach(b => b.onclick = () => removeItem('events', b.dataset.delEvent, 'wydarzenie'));
}

function buildCountryFilters() {
  const target = $('countryFilters');
  if (!target) return;
  const countries = ['Wszystkie', ...new Set(offers.map(o => o.country).filter(Boolean))];
  if (!countries.includes(activeCountry)) activeCountry = 'Wszystkie';
  target.innerHTML = countries.map(c => `<button class="filter-btn${c === activeCountry ? ' active' : ''}" data-country="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('');
  target.querySelectorAll('[data-country]').forEach(b => b.onclick = () => {
    activeCountry = b.dataset.country;
    renderOffers();
  });
}

function renderOffers() {
  if (!$('offerGrid')) return;
  buildCountryFilters();

  const sort = $('offerSort')?.value || 'date';
  let visible = offers.filter(o => activeCountry === 'Wszystkie' || o.country === activeCountry);
  visible = [...visible].sort((a, b) => {
    if (sort === 'price') return Number(a.price_per_person || 999999) - Number(b.price_per_person || 999999);
    if (sort === 'newest') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    return (a.departure_date || '9999').localeCompare(b.departure_date || '9999');
  });

  const priced = offers.map(o => Number(o.price_per_person)).filter(n => Number.isFinite(n) && n > 0);
  const dated = offers.map(o => o.departure_date).filter(Boolean).sort();

  if ($('tripCount')) $('tripCount').textContent = `${offers.length} ${offers.length === 1 ? 'oferta' : offers.length < 5 ? 'oferty' : 'ofert'}`;
  if ($('tripLowest')) $('tripLowest').textContent = priced.length ? `£${Math.min(...priced).toFixed(0)} / os.` : '—';
  if ($('tripSoonest')) $('tripSoonest').textContent = dated.length ? formatDate(dated[0]) : '—';

  $('offerGrid').innerHTML = visible.length
    ? visible.map(o => `<article class="offer-card"><div class="offer-topline"><span>${escapeHtml((o.country || 'WYJAZD').toUpperCase())}</span><details class="more-menu"><summary>${icon('i-more')}</summary><div class="menu-popover"><button data-edit-offer="${o.id}">${icon('i-edit')}Edytuj</button><button class="menu-danger" data-del-offer="${o.id}">${icon('i-trash')}Usuń</button></div></details></div><div class="offer-main"><div><h3>${escapeHtml(o.destination)}</h3><p>${tripRange(o.departure_date, o.nights)}${o.nights ? ` · ${o.nights} nocy` : ''}</p></div><div class="offer-price"><span>${o.price_per_person != null ? 'około' : ''}</span><strong>${money(o.price_per_person, o.currency || 'GBP')}</strong><small>${o.price_per_person != null ? '/ osoba' : 'aktualna cena'}</small></div></div><div class="offer-info">${o.board ? `<span>${escapeHtml(o.board)}</span>` : ''}${o.departure_airport ? `<span>${escapeHtml(o.departure_airport)}</span>` : ''}</div>${o.notes ? `<p class="offer-notes">${escapeHtml(o.notes)}</p>` : ''}<div class="offer-footer"><a class="btn btn-dark" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Zobacz ofertę ${icon('i-external')}</a></div></article>`).join('')
    : '<div class="quiet-empty bordered offer-empty">Brak ofert w tym widoku.</div>';

  document.querySelectorAll('[data-edit-offer]').forEach(b => b.onclick = () => openOffer(offers.find(o => o.id === b.dataset.editOffer)));
  document.querySelectorAll('[data-del-offer]').forEach(b => b.onclick = () => removeItem('offers', b.dataset.delOffer, 'ofertę'));
}

function renderSanta() {
  if (!$('santaGrid')) return;
  const ready = santaReadyCount();
  if ($('santaReady')) $('santaReady').textContent = `${ready} / 8`;
  if ($('santaProgress')) $('santaProgress').style.width = `${ready / 8 * 100}%`;
  if ($('santaHint')) $('santaHint').textContent = ready === 8
    ? 'Wszyscy gotowi. Napisz mi „zrób losowanie”, kiedy chcesz startować.'
    : `Brakuje ${8 - ready} ${8 - ready === 1 ? 'osoby' : 'osób'} do kompletu.`;

  $('santaGrid').innerHTML = santa.map(p => `<article class="santa-person" data-santa-id="${p.id}"><div class="santa-number">${String(p.slot).padStart(2, '0')}</div><div class="santa-fields"><label>Imię<input class="santa-name" value="${escapeHtml(p.name || '')}" placeholder="Imię"></label><label>E-mail<input class="santa-email" type="email" value="${escapeHtml(p.email || '')}" placeholder="email@example.com"></label></div><button class="btn btn-light santa-save">Zapisz</button><div class="santa-state ${p.name && p.email ? 'ready' : ''}">${p.name && p.email ? '✓ Gotowy' : 'Do uzupełnienia'}</div></article>`).join('');

  document.querySelectorAll('.santa-person').forEach(card => {
    card.querySelector('.santa-save').onclick = async () => {
      const id = card.dataset.santaId;
      const name = card.querySelector('.santa-name').value.trim();
      const email = card.querySelector('.santa-email').value.trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        toast('Sprawdź adres e-mail');
        return;
      }
      try {
        await api('santa', 'PATCH', { name, email }, id);
        await loadAll(true);
        toast('✓ Zapisano uczestnika');
      } catch (e) {
        toast(e.message);
      }
    };
  });
}

function renderTeam() {
  const target = $('teamGrid');
  if (!target) return;
  target.innerHTML = TEAM.map((p, i) => `<article class="member-card"><div class="member-avatar">${String(i + 1).padStart(2, '0')}</div><div><span>TEAM A</span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.role)}</small></div></article>`).join('');
}

function renderAll() {
  renderOverview();
  renderCalendar();
  renderOffers();
  renderSanta();
  renderTeam();
}

function openEvent(e = {}) {
  $('eventForm').reset();
  $('eventId').value = e.id || '';
  $('eventDialogTitle').textContent = e.id ? 'Edytuj wydarzenie' : 'Dodaj wydarzenie';
  $('eventTitle').value = e.title || '';
  $('eventDate').value = e.event_date || ymd(new Date());
  $('eventTime').value = (e.event_time || '').slice(0, 5);
  $('eventPerson').value = e.person || 'all';
  $('eventNotes').value = e.notes || '';
  eventDialog.showModal();
}

function openOffer(o = {}) {
  $('offerForm').reset();
  $('offerId').value = o.id || '';
  $('offerDialogTitle').textContent = o.id ? 'Edytuj wyjazd' : 'Dodaj wyjazd';
  $('offerCountry').value = o.country || '';
  $('offerDestination').value = o.destination || '';
  $('offerPrice').value = o.price_per_person ?? '';
  $('offerCurrency').value = o.currency || 'GBP';
  $('offerDate').value = o.departure_date || '';
  $('offerNights').value = o.nights || 7;
  $('offerBoard').value = o.board || '';
  $('offerAirport').value = o.departure_airport || '';
  $('offerUrl').value = o.url || '';
  $('offerNotes').value = o.notes || '';
  offerDialog.showModal();
}

async function removeItem(kind, id, label = 'element') {
  if (!confirm(`Czy na pewno chcesz usunąć ${label}?`)) return;
  try {
    await api(kind, 'DELETE', null, id);
    await loadAll();
    toast('✓ Usunięto');
  } catch (e) {
    toast(e.message);
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tab));
  document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const titles = {
    overview: ['Pulpit', 'Wspólna przestrzeń do planowania tego, co ważne.'],
    calendar: ['Kalendarz', 'Wspólny harmonogram wydarzeń Team A.'],
    offers: ['Wyjazdy', 'Pomysły i oferty, które rozważamy jako Team A.'],
    santa: ['Secret Santa', 'Świąteczne losowanie, którego nikt nie powinien zepsuć.'],
    team: ['Zespół', '8 osób. Jedna przestrzeń.']
  };

  if ($('pageTitle')) $('pageTitle').textContent = titles[tab][0];
  if ($('pageSubtitle')) $('pageSubtitle').textContent = titles[tab][1];

  const action = $('primaryAction');
  if (action) {
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
  }
}

document.querySelectorAll('.nav-item,.mobile-nav-item').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => switchTab(b.dataset.go));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());

if ($('prevMonth')) $('prevMonth').onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  renderCalendar();
};
if ($('nextMonth')) $('nextMonth').onclick = () => {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  renderCalendar();
};
if ($('todayBtn')) $('todayBtn').onclick = () => {
  const n = new Date();
  currentMonth = new Date(n.getFullYear(), n.getMonth(), 1);
  renderCalendar();
};
if ($('offerSort')) $('offerSort').onchange = renderOffers;

if ($('lockBtn')) {
  $('lockBtn').onclick = () => {
    teamPassword = '';
    clearInterval(syncTimer);
    window.location.replace(`${window.location.pathname}?locked=${Date.now()}`);
  };
}

if ($('lockForm')) {
  $('lockForm').addEventListener('submit', e => {
    e.preventDefault();
    unlock($('teamPassword').value);
  });
}

if ($('eventForm')) {
  $('eventForm').addEventListener('submit', async e => {
    e.preventDefault();
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
    } catch (err) {
      toast(err.message);
    }
  });
}

if ($('offerForm')) {
  $('offerForm').addEventListener('submit', async e => {
    e.preventDefault();
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
    } catch (err) {
      toast(err.message);
    }
  });
}

setOptions();
renderTeam();
switchTab('overview');
setTimeout(() => $('teamPassword')?.focus(), 100);