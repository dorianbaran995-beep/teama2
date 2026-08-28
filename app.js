const TEAM = Array.from({ length: 8 }, (_, i) => ({
  id: `member-${i + 1}`,
  name: `Team Member ${i + 1}`,
  role: i === 0 ? 'Team lead' : 'Team member'
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
function parseDate(v){ const [y,m,d]=v.split('-').map(Number); return new Date(y,m-1,d); }
function prettyDate(v){ return v ? parseDate(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'; }
function escapeHtml(v=''){ return String(v).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function teamName(id){ return TEAM.find(p=>p.id===id)?.name || (id==='all' ? 'All team' : id || 'All team'); }
function daysInclusive(a,b){ return Math.floor((parseDate(b)-parseDate(a))/86400000)+1; }
function toast(message){ const el=$('toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }

async function api(kind, method='GET', body=null, id='') {
  const url = new URL(API);
  url.searchParams.set('kind', kind);
  if (id) url.searchParams.set('id', id);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type':'application/json', 'x-team-password': teamPassword },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json.data ?? json;
}

async function unlock(password) {
  teamPassword = password;
  $('lockMessage').textContent = 'Checking…';
  try {
    await api('events');
    lockScreen.hidden = true;
    appRoot.hidden = false;
    $('lockMessage').textContent = '';
    await loadAll();
  } catch (e) {
    teamPassword = '';
    $('lockMessage').textContent = e.message === 'Incorrect password' ? 'Incorrect password.' : 'Could not connect. Please try again.';
  }
}

async function loadAll() {
  $('dbStatus').textContent='Syncing…';
  try {
    [events, holidays, offers] = await Promise.all([api('events'), api('holidays'), api('offers')]);
    $('dbStatus').textContent='Connected';
    renderAll();
  } catch (e) {
    $('dbStatus').textContent='Connection error';
    toast(e.message);
  }
}

function setOptions(){
  $('eventPerson').innerHTML=['<option value="all">All team</option>',...TEAM.map(p=>`<option value="${p.id}">${p.name}</option>`)].join('');
  $('holidayPerson').innerHTML=TEAM.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

function renderTeam(){
  $('teamGrid').innerHTML=TEAM.map((p,i)=>`<article class="member-card"><div class="avatar">${i+1}</div><div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.role)}</small></div></article>`).join('');
}

function renderCalendar(){
  $('monthLabel').textContent=currentMonth.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const grid=$('calendarGrid'); grid.innerHTML='';
  const first=new Date(currentMonth.getFullYear(),currentMonth.getMonth(),1);
  const start=new Date(first); start.setDate(first.getDate()-((first.getDay()+6)%7));
  const today=ymd(new Date());
  for(let i=0;i<42;i++){
    const date=new Date(start); date.setDate(start.getDate()+i); const key=ymd(date);
    const day=document.createElement('div');
    day.className=`day${date.getMonth()===currentMonth.getMonth()?'':' muted'}${key===today?' today':''}`;
    day.innerHTML=`<div class="day-num">${date.getDate()}</div>`;
    events.filter(e=>e.event_date===key).sort((a,b)=>(a.event_time||'99:99').localeCompare(b.event_time||'99:99')).slice(0,3).forEach(e=>{
      const chip=document.createElement('button'); chip.type='button'; chip.className='event-chip';
      chip.innerHTML=`<strong>${escapeHtml(e.title)}</strong><span>${escapeHtml((e.event_time||'All day').slice(0,5))}</span>`;
      chip.addEventListener('click',()=>openEvent(e)); day.appendChild(chip);
    });
    day.addEventListener('dblclick',()=>openEvent({event_date:key}));
    grid.appendChild(day);
  }
  renderUpcoming();
}

function renderUpcoming(){
  const today=ymd(new Date());
  const list=[...events].filter(e=>e.event_date>=today).sort((a,b)=>`${a.event_date} ${a.event_time||''}`.localeCompare(`${b.event_date} ${b.event_time||''}`)).slice(0,10);
  $('upcomingList').innerHTML=list.length?list.map(e=>`<article class="event-item"><div class="date-badge"><strong>${parseDate(e.event_date).getDate()}</strong><span>${parseDate(e.event_date).toLocaleDateString('en-GB',{month:'short'})}</span></div><div><div class="event-title">${escapeHtml(e.title)}</div><div class="meta">${escapeHtml((e.event_time||'All day').slice(0,5))} · ${escapeHtml(teamName(e.person))}${e.notes?` · ${escapeHtml(e.notes)}`:''}</div></div><div class="row-actions"><button class="small-action" data-edit-event="${e.id}">Edit</button><button class="delete" data-del-event="${e.id}">×</button></div></article>`).join(''):'<div class="empty">No upcoming events yet.</div>';
  document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>openEvent(events.find(e=>e.id===b.dataset.editEvent)));
  document.querySelectorAll('[data-del-event]').forEach(b=>b.onclick=()=>removeItem('events',b.dataset.delEvent));
}

function holidayStatus(h,today){ if(h.date_to<today)return['Past','past']; if(h.date_from<=today&&h.date_to>=today)return['Away now','current']; return['Upcoming','upcoming']; }
function renderHolidays(){
  const today=ymd(new Date()); const ordered=[...holidays].sort((a,b)=>a.date_from.localeCompare(b.date_from));
  $('holidayCount').textContent=holidays.length;
  $('awayToday').textContent=holidays.filter(h=>h.date_from<=today&&h.date_to>=today).length;
  const next=ordered.find(h=>h.date_from>=today); $('nextLeave').textContent=next?Math.max(0,Math.ceil((parseDate(next.date_from)-parseDate(today))/86400000)):'—';
  $('holidayList').innerHTML=ordered.length?ordered.map(h=>{const [label,cls]=holidayStatus(h,today);return `<div class="holiday-row"><span><strong>${escapeHtml(teamName(h.person))}</strong>${h.note?`<div class="meta">${escapeHtml(h.note)}</div>`:''}</span><span>${prettyDate(h.date_from)}</span><span>${prettyDate(h.date_to)}</span><span>${daysInclusive(h.date_from,h.date_to)}</span><span><span class="status ${cls}">${label}</span></span><span class="row-actions"><button class="small-action" data-edit-holiday="${h.id}">Edit</button><button class="delete" data-del-holiday="${h.id}">×</button></span></div>`}).join(''):'<div class="empty" style="margin:14px">No holiday added yet.</div>';
  document.querySelectorAll('[data-edit-holiday]').forEach(b=>b.onclick=()=>openHoliday(holidays.find(h=>h.id===b.dataset.editHoliday)));
  document.querySelectorAll('[data-del-holiday]').forEach(b=>b.onclick=()=>removeItem('holidays',b.dataset.delHoliday));
}

function renderOffers(){
  $('offerGrid').innerHTML=offers.length?offers.map(o=>`<article class="offer-card"><div class="offer-head"><div><p class="section-label">${escapeHtml(o.country||'HOLIDAY')}</p><h3>${escapeHtml(o.destination)}</h3></div><strong class="offer-price">${o.price_per_person!=null?`${escapeHtml(o.currency||'GBP')} ${Number(o.price_per_person).toFixed(0)}`:'Price TBC'}</strong></div><div class="offer-meta">${o.departure_date?`📅 ${prettyDate(o.departure_date)}`:''}${o.nights?` · 🌙 ${o.nights} nights`:''}${o.board?` · 🍽 ${escapeHtml(o.board)}`:''}${o.departure_airport?` · ✈ ${escapeHtml(o.departure_airport)}`:''}</div>${o.notes?`<p>${escapeHtml(o.notes)}</p>`:''}<div class="offer-actions"><a class="btn secondary" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">Open offer</a><button class="btn secondary" data-edit-offer="${o.id}">Edit</button><button class="btn danger" data-del-offer="${o.id}">Delete</button></div></article>`).join(''):'<div class="empty">No holiday offers yet. Add the first one.</div>';
  document.querySelectorAll('[data-edit-offer]').forEach(b=>b.onclick=()=>openOffer(offers.find(o=>o.id===b.dataset.editOffer)));
  document.querySelectorAll('[data-del-offer]').forEach(b=>b.onclick=()=>removeItem('offers',b.dataset.delOffer));
}

function renderAll(){ renderCalendar(); renderHolidays(); renderOffers(); renderTeam(); }

function openEvent(e={}){
  $('eventForm').reset(); $('eventId').value=e.id||''; $('eventDialogTitle').textContent=e.id?'Edit event':'Add event';
  $('eventTitle').value=e.title||''; $('eventDate').value=e.event_date||ymd(new Date()); $('eventTime').value=(e.event_time||'').slice(0,5); $('eventPerson').value=e.person||'all'; $('eventNotes').value=e.notes||''; eventDialog.showModal();
}
function openHoliday(h={}){
  $('holidayForm').reset(); $('holidayId').value=h.id||''; $('holidayDialogTitle').textContent=h.id?'Edit holiday':'Add holiday'; const t=ymd(new Date());
  $('holidayPerson').value=h.person||TEAM[0].id; $('holidayFrom').value=h.date_from||t; $('holidayTo').value=h.date_to||t; $('holidayNote').value=h.note||''; holidayDialog.showModal();
}
function openOffer(o={}){
  $('offerForm').reset(); $('offerId').value=o.id||''; $('offerDialogTitle').textContent=o.id?'Edit offer':'Add offer';
  $('offerCountry').value=o.country||''; $('offerDestination').value=o.destination||''; $('offerPrice').value=o.price_per_person??''; $('offerCurrency').value=o.currency||'GBP'; $('offerDate').value=o.departure_date||''; $('offerNights').value=o.nights||7; $('offerBoard').value=o.board||''; $('offerAirport').value=o.departure_airport||''; $('offerUrl').value=o.url||''; $('offerNotes').value=o.notes||''; offerDialog.showModal();
}

async function removeItem(kind,id){ if(!confirm('Delete this item?'))return; try{await api(kind,'DELETE',null,id); await loadAll(); toast('Deleted');}catch(e){toast(e.message);} }

function switchTab(tab){
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===tab));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('pageTitle').textContent={calendar:'Calendar',holiday:'Holiday',offers:'Holiday Offers',team:'Team'}[tab];
  const a=$('primaryAction');
  if(tab==='calendar'){a.hidden=false;a.textContent='+ Add event';a.onclick=()=>openEvent();}
  else if(tab==='holiday'){a.hidden=false;a.textContent='+ Add holiday';a.onclick=()=>openHoliday();}
  else if(tab==='offers'){a.hidden=false;a.textContent='+ Add offer';a.onclick=()=>openOffer();}
  else a.hidden=true;
}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('prevMonth').onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()-1,1);renderCalendar();};
$('nextMonth').onclick=()=>{currentMonth=new Date(currentMonth.getFullYear(),currentMonth.getMonth()+1,1);renderCalendar();};
$('todayBtn').onclick=()=>{const n=new Date();currentMonth=new Date(n.getFullYear(),n.getMonth(),1);renderCalendar();};
$('addHolidayBtn').onclick=()=>openHoliday(); $('addOfferBtn').onclick=()=>openOffer();
$('lockBtn').onclick=()=>{teamPassword='';appRoot.hidden=true;lockScreen.hidden=false;$('teamPassword').value='';$('teamPassword').focus();};

$('lockForm').addEventListener('submit',e=>{e.preventDefault();unlock($('teamPassword').value);});
$('eventForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('eventId').value;const body={title:$('eventTitle').value.trim(),event_date:$('eventDate').value,event_time:$('eventTime').value,person:$('eventPerson').value,notes:$('eventNotes').value.trim()};try{await api('events',id?'PATCH':'POST',body,id);eventDialog.close();await loadAll();toast(id?'Event updated':'Event added');}catch(err){toast(err.message);}});
$('holidayForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('holidayId').value;const from=$('holidayFrom').value,to=$('holidayTo').value;if(to<from){toast('End date cannot be before start date');return;}const body={person:$('holidayPerson').value,date_from:from,date_to:to,note:$('holidayNote').value.trim()};try{await api('holidays',id?'PATCH':'POST',body,id);holidayDialog.close();await loadAll();toast(id?'Holiday updated':'Holiday added');}catch(err){toast(err.message);}});
$('offerForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('offerId').value;const body={country:$('offerCountry').value.trim(),destination:$('offerDestination').value.trim(),price_per_person:$('offerPrice').value,currency:$('offerCurrency').value,departure_date:$('offerDate').value,nights:$('offerNights').value,board:$('offerBoard').value.trim(),departure_airport:$('offerAirport').value.trim(),url:$('offerUrl').value.trim(),notes:$('offerNotes').value.trim()};try{await api('offers',id?'PATCH':'POST',body,id);offerDialog.close();await loadAll();toast(id?'Offer updated':'Offer added');}catch(err){toast(err.message);}});

setOptions(); renderTeam(); switchTab('calendar');
