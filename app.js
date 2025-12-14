
const STORAGE_KEY = "pance_planner_v8";

const DEFAULT_BLUEPRINT = [
  { name: "Cardiovascular System", pct: 11 },
  { name: "Pulmonary System", pct: 9 },
  { name: "Gastrointestinal/Nutrition", pct: 8 },
  { name: "Musculoskeletal System", pct: 8 },
  { name: "Reproductive System", pct: 7 },
  { name: "Infectious Diseases", pct: 7 },
  { name: "Neurologic System", pct: 7 },
  { name: "Psychiatry/Behavioral Science", pct: 7 },
  { name: "Endocrine System", pct: 6 },
  { name: "Eyes, Ears, Nose, and Throat", pct: 6 },
  { name: "Professional Practice", pct: 6 },
  { name: "Hematologic", pct: 5 },
  { name: "Renal System", pct: 5 },
  { name: "Dermatologic System", pct: 4 },
  { name: "Genitourinary", pct: 4 }
];

const state = {
  startDate: "",
  examDate: "",
  daysPerWeek: 5,
  hoursPerDay: 6,
  studyOnExamDay: false,
  daysOff: [],                 // array of yyyy-mm-dd
  studyWeekdays: [],           // array of 0..6 (Sun..Sat). If empty, auto-pick.
  blueprint: JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT)),
  studyDates: [],              // array yyyy-mm-dd
  plan: [],                    // [{date, blocks:[{category,hours}], hours}]
  view: "calendar"             // "calendar" or "list"
};

const $ = (id) => document.getElementById(id);
const CATEGORY_ABBR = {
  "Cardiovascular System": "Cardio",
  "Pulmonary System": "Pulm",
  "Gastrointestinal/Nutrition": "GI/Nutrition",
  "Musculoskeletal System": "MSK",
  "Reproductive System": "Repro",
  "Infectious Diseases": "ID",
  "Neurologic System": "Neuro",
  "Psychiatry/Behavioral Science": "Psych",
  "Endocrine System": "Endo",
  "Eyes, Ears, Nose, and Throat": "ENT",
  "Professional Practice": "Professional",
  "Hematologic": "Heme",
  "Renal System": "Renal",
  "Dermatologic System": "Derm",
  "Genitourinary": "GU"
};
function abbrName(name){ return CATEGORY_ABBR[name] || name; }


function ymdFromDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}

function parseYMD(s){
  if(!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if(Number.isNaN(d.getTime())) return null;
  return d;
}

function mdyFromYmd(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return s;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function parseMDY(s){
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if(!m) return null;
  const d = new Date(Number(m[3]), Number(m[1])-1, Number(m[2]));
  if(Number.isNaN(d.getTime())) return null;
  if(d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[1])-1 || d.getDate() !== Number(m[2])) return null;
  return d;
}

function round2(x){
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
}
function fmt2(x){ return Number(x || 0).toFixed(2); }

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(data && typeof data === "object"){
      Object.assign(state, data);
      if(!Array.isArray(state.blueprint) || state.blueprint.length !== DEFAULT_BLUEPRINT.length){
        state.blueprint = JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT));
      }
      if(!Array.isArray(state.daysOff)) state.daysOff = [];
      if(!Array.isArray(state.plan)) state.plan = [];
      if(!Array.isArray(state.studyDates)) state.studyDates = [];
      if(!Array.isArray(state.studyWeekdays)) state.studyWeekdays = [];
      // sanitize weekdays
      state.studyWeekdays = state.studyWeekdays.filter(x => Number.isInteger(x) && x>=0 && x<=6);
      if(state.view !== "calendar" && state.view !== "list") state.view = "calendar";
    }
  }catch(e){}
}

function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetAll(){
  state.startDate = "";
  state.examDate = "";
  state.daysPerWeek = 5;
  state.hoursPerDay = 6;
  state.studyOnExamDay = false;
  state.daysOff = [];
  state.studyWeekdays = [];
  state.blueprint = JSON.parse(JSON.stringify(DEFAULT_BLUEPRINT));
  state.studyDates = [];
  state.plan = [];
  state.view = "calendar";
  save();
  syncInputs();
  renderBlueprint();
  renderResults();
  applyView();
}

function syncInputs(){
  $("startDate").value = state.startDate || "";
  $("examDate").value = state.examDate || "";
  $("daysPerWeek").value = state.daysPerWeek ?? 5;
  $("hoursPerDay").value = state.hoursPerDay ?? 6;
  $("studyOnExamDay").checked = !!state.studyOnExamDay;
  $("daysOff").value = (state.daysOff || []).map(mdyFromYmd).join(", ");

  // weekdays
  for(let i=0;i<7;i++){
    const cb = document.getElementById(`wd${i}`);
    if(cb) cb.checked = (state.studyWeekdays || []).includes(i);
  }
}

function readInputs(){
  state.startDate = $("startDate").value || "";
  state.examDate = $("examDate").value || "";
  state.daysPerWeek = Number($("daysPerWeek").value || 0);
  state.hoursPerDay = Number($("hoursPerDay").value || 0);
  state.studyOnExamDay = $("studyOnExamDay").checked;

  const raw = $("daysOff").value || "";
  const parts = raw.split(",").map(x => x.trim()).filter(Boolean);
  const offs = [];
  for(const p of parts){
    const d = parseMDY(p);
    if(d) offs.push(ymdFromDate(d));
  }
  state.daysOff = Array.from(new Set(offs)).sort();

  const wds = [];
  for(let i=0;i<7;i++){
    const cb = document.getElementById(`wd${i}`);
    if(cb && cb.checked) wds.push(i);
  }
  state.studyWeekdays = wds;
}

function chooseStudyDates(){
  const start = parseYMD(state.startDate);
  const exam = parseYMD(state.examDate);
  if(!start || !exam) return [];

  const end = new Date(exam);
  if(!state.studyOnExamDay){
    end.setDate(end.getDate()-1);
  }
  if(start.getTime() > end.getTime()) return [];

  const daysOffSet = new Set(state.daysOff || []);

  let allowed = new Set();
  const explicit = Array.isArray(state.studyWeekdays) ? state.studyWeekdays : [];
  if(explicit.length){
    explicit.forEach(w => allowed.add(w));
  }else{
    // fallback: auto-pick based on start weekday and daysPerWeek
    const targetDaysPerWeek = Math.min(7, Math.max(1, Number(state.daysPerWeek || 1)));
    const startWeekday = start.getDay();
    for(let i=0;i<7;i++){
      const wd = (startWeekday + i) % 7;
      allowed.add(wd);
      if(allowed.size >= targetDaysPerWeek) break;
    }
  }

  const out = [];
  for(let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate()+1)){
    const ymd = ymdFromDate(d);
    if(daysOffSet.has(ymd)) continue;
    if(allowed.has(d.getDay())) out.push(ymd);
  }
  return out;
}

function computeAllocations(){
  const totalStudyDays = state.studyDates.length;
  const hoursPerDay = Number(state.hoursPerDay || 0);
  const totalHours = totalStudyDays * hoursPerDay;

  for(const c of state.blueprint){
    const pct = Number(c.pct || 0) / 100;
    const hours = totalHours * pct;
    c.hours = round2(hours);
    c.days = hoursPerDay > 0 ? round2(hours / hoursPerDay) : 0;
  }
  return { totalStudyDays, totalHours };
}

function distributeHoursAcrossDays(studyDates, categories, hoursPerDay){
  const cats = categories.map(c => ({ name: c.name, remaining: Number(c.hours || 0) }))
                        .filter(c => c.remaining > 1e-9);
  let catIdx = 0;
  const out = [];

  for(const date of studyDates){
    let dayRemain = Number(hoursPerDay || 0);
    const blocks = [];

    while(dayRemain > 1e-9 && catIdx < cats.length){
      const cur = cats[catIdx];
      if(cur.remaining <= 1e-9){ catIdx += 1; continue; }

      const alloc = Math.min(cur.remaining, dayRemain);
      if(alloc > 1e-9){
        if(blocks.length && blocks[blocks.length-1].category === cur.name){
          blocks[blocks.length-1].hours = round2(blocks[blocks.length-1].hours + alloc);
        }else{
          blocks.push({ category: cur.name, hours: round2(alloc) });
        }
        cur.remaining = round2(cur.remaining - alloc);
        dayRemain = round2(dayRemain - alloc);
      }
      if(cur.remaining <= 1e-9){ catIdx += 1; }
    }

    const hoursAllocated = round2(Number(hoursPerDay || 0) - dayRemain);
    out.push({ date, blocks, hours: hoursAllocated });
  }
  return out;
}

function renderBlueprint(){
  const tbody = $("bpTable").querySelector("tbody");
  tbody.innerHTML = "";

  state.blueprint.forEach((c, i) => {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = c.name;

    const tdPct = document.createElement("td");
    tdPct.className = "num";
    const input = document.createElement("input");
    input.className = "pctInput";
    input.type = "number";
    input.min = "0";
    input.step = "0.01";
    input.value = fmt2(c.pct);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      state.blueprint[i].pct = Number.isFinite(v) ? v : 0;
      computeAllocations();
      updateTotals();
      save();
    });
    tdPct.appendChild(input);

    const tdHours = document.createElement("td");
    tdHours.className = "num";
    tdHours.id = `bp_hours_${i}`;
    tdHours.textContent = fmt2(c.hours || 0);

    const tdDays = document.createElement("td");
    tdDays.className = "num";
    tdDays.id = `bp_days_${i}`;
    tdDays.textContent = fmt2(c.days || 0);

    tr.appendChild(tdName);
    tr.appendChild(tdPct);
    tr.appendChild(tdHours);
    tr.appendChild(tdDays);
    tbody.appendChild(tr);
  });

  updateTotals();
}

function updateTotals(){
  const pctSum = state.blueprint.reduce((a,b)=> a + Number(b.pct || 0), 0);
  const hoursSum = state.blueprint.reduce((a,b)=> a + Number(b.hours || 0), 0);
  const daysSum = state.blueprint.reduce((a,b)=> a + Number(b.days || 0), 0);

  const pctEl = $("pctTotal");
  pctEl.textContent = `${pctSum.toFixed(2)}%`;
  pctEl.classList.toggle("badTotal", Math.abs(pctSum - 100) > 0.01);

  $("hoursTotal").textContent = fmt2(hoursSum);
  $("daysTotal").textContent = fmt2(daysSum);

  state.blueprint.forEach((c,i)=>{
    const hEl = document.getElementById(`bp_hours_${i}`);
    const dEl = document.getElementById(`bp_days_${i}`);
    if(hEl) hEl.textContent = fmt2(c.hours || 0);
    if(dEl) dEl.textContent = fmt2(c.days || 0);
  });
}

function renderList(){
  const tbody = $("planTable").querySelector("tbody");
  tbody.innerHTML = "";
  for(const item of state.plan){
    const tr = document.createElement("tr");

    const tdDate = document.createElement("td");
    tdDate.textContent = mdyFromYmd(item.date);

    const tdPlan = document.createElement("td");
    if(item.blocks && item.blocks.length){
      tdPlan.innerHTML = item.blocks.map(b => `${escapeHtml(b.category)} ${fmt2(b.hours)}h`).join("<br>");
    }else{
      tdPlan.textContent = "";
    }

    const tdHours = document.createElement("td");
    tdHours.className = "num";
    tdHours.textContent = fmt2(item.hours || 0);

    tr.appendChild(tdDate);
    tr.appendChild(tdPlan);
    tr.appendChild(tdHours);
    tbody.appendChild(tr);
  }
}

function renderCalendar(){
  const root = $("calendarView");
  root.innerHTML = "";

  const planByDate = new Map();
  for(const d of state.plan){
    planByDate.set(d.date, d);
  }

  if(!state.studyDates.length) return;
  const first = parseYMD(state.studyDates[0]);
  const last = parseYMD(state.studyDates[state.studyDates.length-1]);
  if(!first || !last) return;

  const startMonth = new Date(first.getFullYear(), first.getMonth(), 1);
  const endMonth = new Date(last.getFullYear(), last.getMonth(), 1);

  const dowNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  for(let m = new Date(startMonth); m.getTime() <= endMonth.getTime(); m.setMonth(m.getMonth()+1)){
    const monthStart = new Date(m.getFullYear(), m.getMonth(), 1);
    const monthEnd = new Date(m.getFullYear(), m.getMonth()+1, 0);

    const wrapper = document.createElement("div");
    wrapper.className = "calMonth";

    const header = document.createElement("div");
    header.className = "calMonthHeader";
    const title = document.createElement("div");
    title.className = "calMonthTitle";
    title.textContent = monthStart.toLocaleString(undefined, {month:"long", year:"numeric"});
    const legend = document.createElement("div");
    legend.className = "calLegend";
    legend.textContent = "Study days show allocated blocks";
    header.appendChild(title);
    header.appendChild(legend);

    const grid = document.createElement("div");
    grid.className = "calGrid";

    for(const n of dowNames){
      const el = document.createElement("div");
      el.className = "calDow";
      el.textContent = n;
      grid.appendChild(el);
    }

    const lead = monthStart.getDay();
    for(let i=0;i<lead;i++){
      const d = new Date(monthStart);
      d.setDate(d.getDate() - (lead - i));
      grid.appendChild(renderDayCell(d, true, planByDate));
    }

    for(let day=1; day<=monthEnd.getDate(); day++){
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      grid.appendChild(renderDayCell(d, false, planByDate));
    }

    const totalCellsSoFar = lead + monthEnd.getDate();
    const trail = (7 - (totalCellsSoFar % 7)) % 7;
    for(let i=1;i<=trail;i++){
      const d = new Date(monthEnd);
      d.setDate(d.getDate() + i);
      grid.appendChild(renderDayCell(d, true, planByDate));
    }

    wrapper.appendChild(header);
    wrapper.appendChild(grid);
    root.appendChild(wrapper);
  }
}

function renderDayCell(dateObj, outside, planByDate){
  const cell = document.createElement("div");
  cell.className = "calCell" + (outside ? " outside" : "");
  const dateNum = dateObj.getDate();
  const ymd = ymdFromDate(dateObj);

  const top = document.createElement("div");
  top.className = "calDateRow";
  const dn = document.createElement("div");
  dn.className = "calDateNum";
  dn.textContent = String(dateNum);
  const hrs = document.createElement("div");
  hrs.className = "calHours";

  const plan = planByDate.get(ymd);
  if(plan && plan.hours > 0){
    hrs.textContent = `${fmt2(plan.hours)}h`;
  }else{
    hrs.textContent = "";
  }

  top.appendChild(dn);
  top.appendChild(hrs);

  const blocks = document.createElement("div");
  blocks.className = "calBlocks";
  if(plan && plan.blocks && plan.blocks.length){
    const maxLines = 3;
    plan.blocks.slice(0, maxLines).forEach(b=>{
      const line = document.createElement("div");
      line.textContent = `${abbrName(b.category)}: ${fmt2(b.hours)}h`;
      blocks.appendChild(line);
    });
    if(plan.blocks.length > maxLines){
      const tag = document.createElement("span");
      tag.className = "calTag";
      tag.textContent = `+${plan.blocks.length - maxLines} more`;
      blocks.appendChild(tag);
    }
    cell.title = plan.blocks.map(b=>`${abbrName(b.category)} ${fmt2(b.hours)}h`).join(" | ");
  }

  cell.appendChild(top);
  cell.appendChild(blocks);
  return cell;
}

function renderResults(){
  const card = $("resultsCard");
  if(!state.plan || !state.plan.length){
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const start = state.startDate ? mdyFromYmd(state.startDate) : "";
  const exam = state.examDate ? mdyFromYmd(state.examDate) : "";
  const daysOffCount = (state.daysOff || []).length;

  const totalStudyDays = state.studyDates.length;
  const totalHours = totalStudyDays * Number(state.hoursPerDay || 0);

  const wds = (state.studyWeekdays || []).slice().sort((a,b)=>a-b);
  const wdNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const wdText = wds.length ? wds.map(i=>wdNames[i]).join(", ") : "Auto";

  $("summary").innerHTML = `
    <span>Start: ${start}</span>
    <span>Exam: ${exam}</span>
    <span>Study days: ${fmt2(totalStudyDays)}</span>
    <span>Days off: ${fmt2(daysOffCount)}</span>
    <span>Hours/day: ${fmt2(state.hoursPerDay)}</span>
    <span>Total hours: ${fmt2(totalHours)}</span>
    <span>Study weekdays: ${wdText}</span>
  `;

  renderList();
  renderCalendar();
  applyView();
}

function applyView(){
  const cal = $("calendarView");
  const list = $("listViewWrap");
  const bCal = $("btnViewCalendar");
  const bList = $("btnViewList");

  const v = state.view || "calendar";
  if(v === "calendar"){
    cal.style.display = "block";
    list.style.display = "none";
    bCal.classList.add("active");
    bList.classList.remove("active");
  }else{
    cal.style.display = "none";
    list.style.display = "block";
    bCal.classList.remove("active");
    bList.classList.add("active");
  }
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function generate(){
  readInputs();
  state.studyDates = chooseStudyDates();
  computeAllocations();
  updateTotals();
  state.plan = distributeHoursAcrossDays(state.studyDates, state.blueprint, Number(state.hoursPerDay || 0));
  save();
  renderResults();
}

function exportCSV(){
  if(!state.plan || !state.plan.length) return;
  const rows = [];
  rows.push(["Date","Category Blocks","Hours Total"].join(","));
  for(const day of state.plan){
    const date = mdyFromYmd(day.date);
    const blocks = (day.blocks || []).map(b => `${b.category} ${fmt2(b.hours)}h`).join(" | ");
    const hrs = fmt2(day.hours || 0);
    rows.push([csvEscape(date), csvEscape(blocks), hrs].join(","));
  }
  const csv = rows.join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pance_study_calendar.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(s){
  const str = String(s ?? "");
  if(/[",\n]/.test(str)) return `"${str.replace(/"/g,'""')}"`;
  return str;
}

function wire(){
  $("btnGenerate").addEventListener("click", generate);
  $("btnExport").addEventListener("click", exportCSV);
  $("btnReset").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    resetAll();
  });

  $("btnViewCalendar").addEventListener("click", ()=>{
    state.view = "calendar";
    save();
    applyView();
  });
  $("btnViewList").addEventListener("click", ()=>{
    state.view = "list";
    save();
    applyView();
  });

  // persist on input changes
  ["startDate","examDate","daysPerWeek","hoursPerDay","studyOnExamDay","daysOff"].forEach(id=>{
    $(id).addEventListener("change", ()=>{ readInputs(); save(); });
  });

  // weekday checkboxes
  for(let i=0;i<7;i++){
    const cb = document.getElementById(`wd${i}`);
    if(cb){
      cb.addEventListener("change", ()=>{ readInputs(); save(); });
    }
  }
}

(function init(){
  load();
  wire();
  syncInputs();

  state.studyDates = chooseStudyDates();
  computeAllocations();
  renderBlueprint();

  if(state.plan && state.plan.length){
    renderResults();
  }else{
    applyView();
  }
})();
