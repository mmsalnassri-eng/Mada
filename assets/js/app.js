"use strict";


/* =========================================================
   1) طبقة البيانات
   ---------------------------------------------------------
   النموذج الأولي يحفظ البيانات الوهمية في متصفح المستخدم فقط، ولا يتصل بأي خادم.
   عند البناء الفعلي:
   - تُستبدل Store بقاعدة بيانات مستضافة داخل المؤسسة.
   - تُطبق الصلاحيات في القاعدة (Row-Level Security) لا في الواجهة.
   - تُحتسب النقاط والمؤشرات والإنذارات والتنبؤات في القاعدة، وسجل التدقيق للإضافة فقط.
   - لا تُخزّن بيانات موظفين حقيقية في المتصفح.
   ========================================================= */
const STORAGE_KEY = "mada.v5";
const Store = {
  load(){ try{ const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } },
  save(d){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }catch(e){} },
  clear(){ try{ localStorage.removeItem(STORAGE_KEY); }catch(e){} }
};

/* =========================================================
   2) أدوات مساعدة
   ========================================================= */
function isoOffset(days){ const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function addDays(iso, n){ const d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
function daysBetween(a, b){ return Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00"))/864e5); } /* b − a */
const todayISO = () => isoOffset(0);
const LOC = "ar-OM-u-nu-latn";
const fDate = new Intl.DateTimeFormat(LOC,{day:"numeric",month:"long"});
const fDateY = new Intl.DateTimeFormat(LOC,{day:"numeric",month:"long",year:"numeric"});
const fDT = new Intl.DateTimeFormat(LOC,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
const fmtDate = iso => fDate.format(new Date(iso+"T12:00:00"));
const fmtDateY = iso => fDateY.format(new Date(iso+"T12:00:00"));
const fmtDT = ts => fDT.format(new Date(ts));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt1 = n => { const v = Math.round(Math.abs(n)*10)/10; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
const signed = n => n>0 ? "+"+n : n<0 ? "−"+Math.abs(n) : "0";
const pctTxt = r => r==null ? "—" : Math.round(r*100)+"%";
const ptsTxt = d => { const a = Math.abs(d), m = a % 100; return (d>0?"+":d<0?"−":"") + a + ((m>=3 && m<=10) ? " نقاط مئوية" : " نقطة مئوية"); };
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* صيغ العدد في العربية: [مفرد، مثنى، جمع (3–10)، تمييز (11+)] */
const W_DAYS = ["يوم واحد","يومان","أيام","يوماً"];
const W_WEEKS = ["أسبوع واحد","أسبوعان","أسابيع","أسبوعاً"];
const W_OUT = ["مخرج واحد","مخرجان","مخرجات","مخرجاً"];
const W_EMP = ["موظف واحد","موظفان","موظفين","موظفاً"];
const W_PTS = ["نقطة واحدة","نقطتان","نقاط","نقطة"];
const W_HRS = ["ساعة واحدة","ساعتان","ساعات","ساعة"];
const W_ACT = ["إجراء واحد","إجراءان","إجراءات","إجراءً"];
function plural(n, f){ if (n===1) return f[0]; if (n===2) return f[1]; const m = n % 100; return `${n} ${(n===0 || (m>=3 && m<=10)) ? f[2] : f[3]}`; }
function daysGen(n){ return n===1 ? "يوم واحد" : n===2 ? "يومين" : plural(n, W_DAYS); }
function byDays(n){ return n===1 ? "بيوم واحد" : n===2 ? "بيومين" : `بـ${plural(n, W_DAYS)}`; }
function weeksGen(n){ return n===1 ? "أسبوع واحد" : n===2 ? "أسبوعين" : plural(n, W_WEEKS); }
function ptsN(n){ return n===1 ? "نقطة واحدة" : n===2 ? "نقطتان" : plural(n, W_PTS); }
function daysWord(n){ return plural(n, W_DAYS); }
function ageTxt(n){ return n<=0 ? "اليوم" : n===1 ? "منذ يوم" : n===2 ? "منذ يومين" : `منذ ${plural(n, W_DAYS)}`; }
function leadTxt(d){
  if (d==null) return "—";
  return d>0.05 ? `قبل الموعد بـ${fmt1(d)} يوم` : d<-0.05 ? `بعد الموعد بـ${fmt1(d)} يوم` : "في الموعد";
}
function initials(name){
  const p = String(name).trim().split(/\s+/), a = (p[0]||"").charAt(0), b = (p[1]||"").replace(/^ال/,"").charAt(0);
  return b ? a + "\u200C" + b : a;   /* فاصل غير واصل يمنع اتصال الحرفين */
}
const cssEsc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, "\\$&");
/* مولّد أرقام شبه عشوائية ثابت البذرة: البيانات الوهمية نفسها في كل تشغيل */
function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a>>>15, 1 | a); t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t; return ((t ^ t>>>14) >>> 0) / 4294967296; }; }

/* ذاكرة مؤقتة للحسابات خلال دورة رسم واحدة: تُمسح مع كل رسم أو تعديل */
let MEMO = {};
const memo = (k, fn) => (k in MEMO) ? MEMO[k] : (MEMO[k] = fn());
/* سجل محتوى التلميحات العائمة: يُعاد بناؤه مع كل رسم */
const TIPS = new Map();
let tipSeq = 0, uidSeq = 0;
const tip = html => { const id = "t" + (++tipSeq); TIPS.set(id, html); return id; };
const uid = p => (p || "u") + (++uidSeq);

const svgI = (p, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw||2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const ICON = {
  check: svgI('<path d="M5 12l5 5 9-10"/>', 3),
  x: svgI('<path d="M6 6l12 12M18 6L6 18"/>', 3),
  dash: svgI('<path d="M6 12h12"/>', 3),
  home: svgI('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  clock: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  building: svgI('<path d="M4 21V5l8-2v18"/><path d="M12 8h8v13"/><path d="M8 8v.01M8 12v.01M8 16v.01M16 12v.01M16 16v.01"/>'),
  list: svgI('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  alert: svgI('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>'),
  grid: svgI('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  inbox: svgI('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
  users: svgI('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  tasks: svgI('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>'),
  cap: svgI('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
  target: svgI('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  sliders: svgI('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  shield: svgI('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  report: svgI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'),
  sparkles: svgI('<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  sun: svgI('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  moon: svgI('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  monitor: svgI('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  trendUp: svgI('<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>'),
  trendDown: svgI('<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>'),
  bolt: svgI('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
  calc: svgI('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h4"/>'),
  copy: svgI('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  printer: svgI('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  chevron: svgI('<path d="m15 18-6-6 6-6"/>'),
  minus: svgI('<path d="M5 12h14"/>'),
  info: svgI('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  activity: svgI('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  scale: svgI('<path d="M12 3v18M7 21h10M5 7h14"/><path d="M5 7l-3 7a3.5 3.5 0 0 0 6 0zM19 7l-3 7a3.5 3.5 0 0 0 6 0z"/>'),
  gauge: svgI('<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'),
  award: svgI('<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>'),
  user: svgI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  flag: svgI('<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>')
};

/* =========================================================
   3) البيانات الوهمية — أسماء ووقائع غير حقيقية
   ========================================================= */
function seedData(){
  const T = (d,h) => isoOffset(d)+"T"+(h||"09:00")+":00";
  const PILOT_START = -38, BASELINE_WEEKS = 6;

  /* السجل التاريخي للمخرجات: يغذي خط الأساس والرسوم وسرعة الإنجاز والتنبؤ، ولا يظهر في جدول المهام.
     ملف كل موظف: [الالتزام قبل التجربة، الالتزام خلالها، نسبة الإنجاز المبكر قبلها، خلالها] */
  const PROFILE = {
    e1:[.78,.92,.30,.50], e2:[.74,.86,.25,.40], e3:[.72,.88,.25,.45], e4:[.56,.62,.15,.20],
    e5:[.66,.50,.20,.15], e6:[.60,.78,.20,.30], e7:[.70,.72,.20,.20], e8:[.72,.78,.25,.30]
  };
  /* توزيع منتظم بالمراكم (لا قرعة عشوائية) حتى تطابق النسب ملف كل موظف دون ضجيج؛ العشوائية للأيام فقط */
  const rnd = mulberry32(20261007), history = [];
  Object.entries(PROFILE).forEach(([emp,[pB,pP,eB,eP]], idx) => {
    let accT = (idx*0.37)%1, accE = (idx*0.61)%1;
    const push = d => {
      const pil = d >= PILOT_START;
      accT += pil ? pP : pB;
      const onTime = accT >= 1; if (onTime) accT -= 1;
      let early = false;
      if (onTime){ accE += pil ? eP : eB; early = accE >= 1; if (early) accE -= 1; }
      const lead = onTime ? (early ? 2 + Math.floor(rnd()*3) : Math.floor(rnd()*2)) : -(1 + Math.floor(rnd()*4));
      history.push({emp, deadline:isoOffset(d), completedAt:isoOffset(d - lead), onTime});
    };
    let d = PILOT_START - BASELINE_WEEKS*7, step = 3;
    while (d <= -17){ push(d); d += step; step = step===3 ? 4 : 3; }
    for (let f = -16 + (idx % 3); f <= -1; f += 10) push(f);   /* مخرج مؤرشف أسبوعي يحافظ على كثافة البيانات */
  });

  return {
    version:5,
    config:{ base:50, onTime:5, earlyBonus:3, earlyDays:2, lateDelivered:0, late:-3, course:10,
             remoteMin:60, officeMin:45, daysFull:2, daysPartial:1,
             warnLate:2, warnWindow:14, warnDrop:15, predictThreshold:60, predictHorizon:10,
             pilotStart:isoOffset(PILOT_START), pilotWeeks:12, baselineWeeks:BASELINE_WEEKS,
             coreStart:"08:00", coreEnd:"12:00", responseMins:30 },
    roles:[
      {id:"r1",title:"أخصائي تخطيط",suit:"full"},{id:"r2",title:"أخصائي موارد بشرية",suit:"partial"},
      {id:"r3",title:"مهندس شبكات",suit:"partial"},{id:"r4",title:"محاسب",suit:"full"},
      {id:"r5",title:"أخصائي اتصال مؤسسي",suit:"full"},{id:"r6",title:"أخصائي جودة",suit:"full"},
      {id:"r7",title:"منسق خدمات المراجعين",suit:"onsite"},{id:"r8",title:"أخصائي مشتريات",suit:"partial"}
    ],
    /* commuteMins: زمن التنقل ذهاباً وإياباً كما صرّح به الموظف (وهمي) — لحساب الساعات الموفرة تقديرياً */
    employees:[
      {id:"e1",name:"سالم", dept:"التخطيط والتطوير",roleId:"r1",probationDone:true, charterSigned:true, homeReady:true, consent:true, commuteMins:70,decision:{mode:"remote",date:isoOffset(-30),by:"مدير القسم"},recall:null,interventions:[]},
      {id:"e2",name:"مريم",dept:"الموارد البشرية", roleId:"r2",probationDone:true, charterSigned:true, homeReady:true, consent:true, commuteMins:50,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]},
      {id:"e3",name:"خالد", dept:"تقنية المعلومات", roleId:"r3",probationDone:true, charterSigned:true, homeReady:true, consent:false,commuteMins:90,decision:{mode:"remote",date:isoOffset(-30),by:"مدير القسم"},recall:null,interventions:[]},
      {id:"e4",name:"أسماء",dept:"الشؤون المالية",  roleId:"r4",probationDone:true, charterSigned:true, homeReady:true, consent:false,commuteMins:60,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]},
      {id:"e5",name:"يوسف",dept:"الاتصال المؤسسي", roleId:"r5",probationDone:true, charterSigned:true, homeReady:true, consent:false,commuteMins:80,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]},
      {id:"e6",name:"هند", dept:"الجودة",          roleId:"r6",probationDone:true, charterSigned:false,homeReady:true, consent:false,commuteMins:55,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]},
      {id:"e7",name:"أحمد", dept:"الشؤون الإدارية", roleId:"r7",probationDone:true, charterSigned:false,homeReady:false,consent:true, commuteMins:40,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]},
      {id:"e8",name:"نورة",dept:"المشتريات",       roleId:"r8",probationDone:false,charterSigned:true, homeReady:true, consent:true, commuteMins:65,decision:{mode:"onsite",date:isoOffset(-38),by:"الوضع الافتراضي"},recall:null,interventions:[]}
    ],
    /* status: done مخرج معتمد (completedAt = تاريخ الاعتماد) | progress قيد التنفيذ | late متأخر لم يُسلَّم */
    tasks:[
      {id:"t1", emp:"e1",title:"إعداد تقرير الأداء الربعي",          kpi:"تسليم التقرير معتمداً",         deadline:isoOffset(-12),status:"done",completedAt:isoOffset(-15),progress:100},
      {id:"t2", emp:"e1",title:"تحديث الخطة التشغيلية للقسم",        kpi:"اعتماد الخطة من المدير",        deadline:isoOffset(-4), status:"done",completedAt:isoOffset(-4), progress:100},
      {id:"t3", emp:"e1",title:"تحليل نتائج استبيان الرضا",          kpi:"عرض النتائج في اجتماع القسم",   deadline:isoOffset(9),  status:"progress",progress:40},
      {id:"t4", emp:"e2",title:"مراجعة ملفات التعيين الجديدة",       kpi:"إغلاق 12 ملفاً",               deadline:isoOffset(-10),status:"done",completedAt:isoOffset(-13),progress:100},
      {id:"t5", emp:"e2",title:"إعداد دليل الاستقبال الوظيفي",       kpi:"نشر الدليل للموظفين الجدد",     deadline:isoOffset(-2), status:"done",completedAt:isoOffset(-2), progress:100},
      {id:"t6", emp:"e3",title:"تفعيل التحقق الثنائي لحسابات القسم", kpi:"تغطية 100% من الحسابات",        deadline:isoOffset(-6), status:"done",completedAt:isoOffset(-9), progress:100},
      {id:"t23",emp:"e3",title:"توثيق إجراءات النسخ الاحتياطي",      kpi:"دليل إجراءات معتمد",            deadline:isoOffset(-9), status:"late",progress:50},
      {id:"t24",emp:"e3",title:"تحديث قواعد جدار الحماية",           kpi:"تطبيق القواعد واختبارها",       deadline:isoOffset(-4), status:"progress",progress:60},
      {id:"t7", emp:"e3",title:"إعداد الشبكة الافتراضية الخاصة",      kpi:"اتصال آمن لموظفي التجربة",      deadline:isoOffset(6),  status:"progress",progress:65},
      {id:"t8", emp:"e4",title:"مطابقة كشوف الحسابات الشهرية",       kpi:"مطابقة دون فروقات",             deadline:isoOffset(-16),status:"late",progress:70},
      {id:"t9", emp:"e4",title:"إعداد تقرير المصروفات",              kpi:"تسليم التقرير معتمداً",         deadline:isoOffset(-7), status:"done",completedAt:isoOffset(-7), progress:100},
      {id:"t10",emp:"e4",title:"تحديث سجل الأصول",                    kpi:"تحديث 100% من البنود",           deadline:isoOffset(-3), status:"progress",progress:55,
        appeal:{reason:"عطل تقني",note:"تعطل نظام الأصول ثلاثة أيام أثناء التحديث، وبلاغ قسم تقنية المعلومات مرفق.",status:"pending",date:isoOffset(-1)}},
      {id:"t11",emp:"e5",title:"إعداد النشرة الداخلية",               kpi:"إصدار النشرة في موعدها",         deadline:isoOffset(-9), status:"late",progress:80,
        appeal:{reason:"أخرى",note:"كان لدي ضغط عمل كبير ولم أتمكن من الإنجاز.",status:"pending",date:isoOffset(0)}},
      {id:"t12",emp:"e5",title:"تحديث محتوى الموقع الإلكتروني",       kpi:"نشر 6 تحديثات",                 deadline:isoOffset(-1), status:"progress",progress:30},
      {id:"t13",emp:"e6",title:"تدقيق إجراءات الأرشفة",              kpi:"إغلاق ملاحظات التدقيق",          deadline:isoOffset(-11),status:"done",completedAt:isoOffset(-11),progress:100},
      {id:"t14",emp:"e6",title:"تحديث مؤشرات الجودة",                kpi:"اعتماد المؤشرات المحدثة",        deadline:isoOffset(-5), status:"done",completedAt:isoOffset(-6), progress:100},
      {id:"t15",emp:"e6",title:"إعداد تقرير عدم المطابقة",            kpi:"تسليم التقرير معتمداً",          deadline:isoOffset(-2), status:"late",progress:60},
      {id:"t22",emp:"e6",title:"إعداد خطة التدقيق الداخلي",           kpi:"اعتماد الخطة",                  deadline:isoOffset(8),  status:"progress",progress:30},
      {id:"t16",emp:"e7",title:"تنظيم جدول اجتماعات الربع القادم",   kpi:"نشر الجدول المعتمد",             deadline:isoOffset(-8), status:"done",completedAt:isoOffset(-10),progress:100},
      {id:"t17",emp:"e7",title:"حصر احتياجات المكاتب",               kpi:"تقرير احتياجات مكتمل",           deadline:isoOffset(5),  status:"progress",progress:20},
      {id:"t18",emp:"e8",title:"طرح مناقصة الأجهزة المحمولة",        kpi:"نشر المناقصة في موعدها",         deadline:isoOffset(-13),status:"done",completedAt:isoOffset(-13),progress:100},
      {id:"t19",emp:"e8",title:"تقييم عروض الموردين",                 kpi:"تقرير تقييم معتمد",              deadline:isoOffset(-6), status:"done",completedAt:isoOffset(-8), progress:100},
      {id:"t20",emp:"e8",title:"تحديث قائمة الموردين المعتمدين",     kpi:"قائمة محدثة ومعتمدة",            deadline:isoOffset(-3), status:"done",completedAt:isoOffset(-3), progress:100},
      {id:"t21",emp:"e8",title:"إغلاق أوامر الشراء المعلقة",         kpi:"إغلاق جميع الأوامر",             deadline:isoOffset(-1), status:"done",completedAt:isoOffset(-1),progress:100}
    ],
    history,
    courses:[
      {id:"c4",title:"أمن المعلومات عند العمل من المنزل",        hours:2,required:true, desc:"الشبكات الآمنة، والتحقق الثنائي، والتعامل مع البيانات الحساسة خارج المقر."},
      {id:"c2",title:"إدارة الوقت عن بعد",                      hours:3,required:false,desc:"تخطيط الأسبوع بالمخرجات، وحماية ساعات التركيز، والتعامل مع مشتتات المنزل."},
      {id:"c3",title:"منهجيات التفكير التصميمي لحل المشكلات",   hours:6,required:false,desc:"التعاطف مع المستفيد، وتعريف المشكلة، وتوليد الأفكار، وبناء النماذج الأولية واختبارها."},
      {id:"c1",title:"أخلاقيات الذكاء الاصطناعي في بيئة العمل", hours:4,required:false,desc:"الاستخدام المسؤول لأدوات الذكاء الاصطناعي، وحماية البيانات، والشفافية في المخرجات."}
    ],
    completions:[
      {emp:"e1",course:"c2",status:"verified",date:isoOffset(-20),by:"مدير القسم"},
      {emp:"e1",course:"c4",status:"verified",date:isoOffset(-33),by:"مدير القسم"},
      {emp:"e2",course:"c4",status:"verified",date:isoOffset(-25),by:"مدير القسم"},
      {emp:"e3",course:"c4",status:"verified",date:isoOffset(-33),by:"مدير القسم"},
      {emp:"e4",course:"c4",status:"verified",date:isoOffset(-22),by:"مدير القسم"},
      {emp:"e5",course:"c4",status:"pending", date:isoOffset(-1)}
    ],
    continuity:{active:false,reason:"",until:"",by:""},
    survey:{sat:[3.2,3.9],conf:[2.7,3.3]},
    incidents:0,
    audit:[
      {ts:T(0,"08:20"),actor:"يوسف",action:"اعتراض على خصم",detail:"إعداد النشرة الداخلية — أخرى"},
      {ts:T(-1,"10:40"),actor:"يوسف",action:"طلب توثيق شهادة",detail:"أمن المعلومات عند العمل من المنزل"},
      {ts:T(-1,"09:05"),actor:"أسماء",action:"اعتراض على خصم",detail:"تحديث سجل الأصول — عطل تقني"},
      {ts:T(-30,"11:20"),actor:"مدير القسم",action:"اعتماد نمط العمل",detail:"خالد: من حضوري إلى عن بعد"},
      {ts:T(-30,"11:15"),actor:"مدير القسم",action:"اعتماد نمط العمل",detail:"سالم: من حضوري إلى عن بعد"},
      {ts:T(-38,"08:30"),actor:"أخصائي الموارد البشرية",action:"بدء التجربة",detail:"12 أسبوعاً، قسم تجريبي واحد، 8 موظفين، خط أساس من 6 أسابيع سابقة"}
    ],
    session:{role:"executive",page:"home",fStatus:"all",fEmp:"all",tab:"all",theme:"auto",dockMin:false,calc:null}
  };
}

/* =========================================================
   4) الحالة والصلاحيات
   ========================================================= */
let state = Store.load();
if (!state || state.version !== 5) state = seedData();
state.session = Object.assign({role:"executive",page:"home",fStatus:"all",fEmp:"all",tab:"all",theme:"auto",dockMin:false,calc:null}, state.session || {});
const persist = () => Store.save(state);

const SELF_ID = "e6";
const ROLE_ACTOR = {manager:"مدير القسم", hr:"أخصائي الموارد البشرية", executive:"صاحب القرار"};
const ROLE_LABEL = {executive:"صاحب القرار", manager:"مدير مباشر", hr:"الموارد البشرية", employee:"موظف"};
const PERMS = {
  employee:new Set(["self"]),
  manager:new Set(["decide","tasks","appeals","verify","intervene"]),
  hr:new Set(["decide","tasks","appeals","verify","intervene","continuity","rules","audit"]),
  executive:new Set(["exec","audit"])
};
const NAV = {
  executive:[["home","اللوحة الاستراتيجية","grid"],["report","التقرير التنفيذي","report"],["pilot","معايير النجاح","target"],["audit","سجل التدقيق","shield"]],
  manager:[["home","لوحة القيادة","grid"],["actions","مركز الإجراءات","inbox"],["team","الفريق والمحاسبية","users"],["tasks","المخرجات والمهام","tasks"],["kafaa","منصة كفاءة","cap"],["pilot","معايير النجاح","target"],["report","التقرير التنفيذي","report"]],
  hr:[["home","لوحة القيادة","grid"],["actions","مركز الإجراءات","inbox"],["team","الفريق والمحاسبية","users"],["tasks","المخرجات والمهام","tasks"],["kafaa","منصة كفاءة","cap"],["pilot","معايير النجاح","target"],["report","التقرير التنفيذي","report"],["rules","القواعد والميثاق","sliders"],["audit","سجل التدقيق","shield"]],
  employee:[["home","مداي","grid"],["tasks","مهامي","tasks"],["kafaa","منصة كفاءة","cap"]]
};
const role = () => state.session.role;
const can = p => PERMS[role()].has(p);
const isLead = () => role()==="manager" || role()==="hr";
function guard(p){ if (!can(p)){ toast("لا تملك صلاحية تنفيذ هذا الإجراء."); return false; } return true; }
const empById = id => state.employees.find(e => e.id === id);
const self = () => empById(SELF_ID);
const roleOf = e => state.roles.find(r => r.id === e.roleId);
const courseById = id => state.courses.find(c => c.id === id);
const REQUIRED = () => (state.courses.find(c => c.required) || {}).id;
const completionOf = (emp,course) => state.completions.find(x => x.emp===emp && x.course===course);
const hasVerified = (emp,course) => { const c = completionOf(emp,course); return !!c && c.status==="verified"; };
function actor(){ return role()==="employee" ? self().name : ROLE_ACTOR[role()]; }
function log(action, detail){ state.audit.unshift({ts:new Date().toISOString(), actor:actor(), action, detail}); }

/* =========================================================
   5) احتساب المخرجات (يُنقل إلى قاعدة البيانات عند البناء)
   ---------------------------------------------------------
   early    مخرج معتمد قبل الموعد بـ earlyDays أيام أو أكثر
   ontime   مخرج معتمد في الموعد
   lateDone مخرج معتمد بعد الموعد
   overdue  تجاوز الموعد ولم يُسلَّم (يدوياً أو تلقائياً)
   open     قيد التنفيذ ولم يحن موعده
   ========================================================= */
const appealAccepted = t => !!(t.appeal && t.appeal.status==="accepted");
function taskState(t){
  if (t.status==="done"){
    const lead = daysBetween(t.completedAt || t.deadline, t.deadline);
    return lead >= state.config.earlyDays ? "early" : lead >= 0 ? "ontime" : "lateDone";
  }
  if (t.status==="late") return "overdue";
  return t.deadline < todayISO() ? "overdue" : "open";
}
const isAutoLate = t => t.status==="progress" && t.deadline < todayISO();
const STATE_LABEL = {early:"معتمد قبل الموعد", ontime:"معتمد في الموعد", lateDone:"معتمد بعد الموعد", overdue:"متأخر — لم يُسلَّم", open:"قيد التنفيذ"};
const STATE_PILL = {early:"pill-ok", ontime:"pill-ok", lateDone:"pill-review", overdue:"pill-no", open:"pill-info"};

function taskImpact(t){
  const c = state.config, s = taskState(t);
  if (s==="early") return c.onTime + c.earlyBonus;
  if (s==="ontime") return c.onTime;
  if (s==="lateDone") return c.lateDelivered;
  if (s==="overdue") return appealAccepted(t) ? 0 : c.late;
  return 0;
}
function ledger(id){
  const c = state.config, rows = [{label:"الرصيد الافتتاحي",delta:c.base}];
  state.tasks.filter(t => t.emp===id).forEach(t => {
    const s = taskState(t), d = taskImpact(t);
    if (s==="open") return;
    const lab = s==="early" ? `مخرج معتمد قبل الموعد ${byDays(daysBetween(t.completedAt,t.deadline))}`
      : s==="ontime" ? "مخرج معتمد في الموعد" : s==="lateDone" ? "مخرج معتمد بعد الموعد"
      : appealAccepted(t) ? "خصم مستبعد بعد قبول الاعتراض" : "تأخر دون تسليم";
    rows.push({label:lab+": "+t.title, delta:d});
  });
  state.completions.filter(x => x.emp===id && x.status==="verified")
    .forEach(x => rows.push({label:"شهادة موثقة: "+courseById(x.course).title, delta:c.course}));
  return rows;
}
const points = id => memo("pts"+id, () => ledger(id).reduce((s,r) => s+r.delta, 0));

/* سجل موحّد لنتائج المخرجات المغلقة (التاريخي + الحالي) — أساس كل المؤشرات */
function events(){
  return memo("ev", () => {
    const out = state.history.map(h => ({emp:h.emp, deadline:h.deadline, completedAt:h.completedAt, onTime:h.onTime}));
    state.tasks.forEach(t => {
      const s = taskState(t);
      if (s==="open" || (s==="overdue" && appealAccepted(t))) return;
      out.push({emp:t.emp, deadline:t.deadline, completedAt:t.status==="done" ? t.completedAt : null, onTime:s==="early"||s==="ontime"});
    });
    return out;
  });
}
const rate = xs => xs.length ? xs.filter(x => x.onTime).length/xs.length : null;
const inBaseline = x => x.deadline < state.config.pilotStart;
const inPilot = x => x.deadline >= state.config.pilotStart && x.deadline <= todayISO();
function baselineOf(id){ return memo("bl"+id, () => rate(events().filter(x => x.emp===id && inBaseline(x)))); }
function pilotRateOf(id){ return memo("pr"+id, () => rate(events().filter(x => x.emp===id && inPilot(x)))); }
function recentRate(id){ const from = isoOffset(-28), to = todayISO(); return memo("rr"+id, () => rate(events().filter(x => x.emp===id && x.deadline >= from && x.deadline <= to))); }

/* سرعة الإنجاز = متوسط الأيام بين اعتماد المخرج وموعده (موجب = قبل الموعد)، آخر 28 يوماً مقابل الـ28 السابقة */
function velocity(id){
  return memo("vel"+id, () => {
    const done = events().filter(x => x.emp===id && x.completedAt);
    const cut = isoOffset(-28), cut2 = isoOffset(-56);
    const avg = a => a.length ? a.reduce((s,x) => s + daysBetween(x.completedAt, x.deadline), 0)/a.length : null;
    const cur = done.filter(x => x.completedAt >= cut), prev = done.filter(x => x.completedAt < cut && x.completedAt >= cut2);
    return {cur:avg(cur), prev:avg(prev), nCur:cur.length, nPrev:prev.length};
  });
}

/* انحدار خطي بالمربعات الصغرى: y = icpt + slope·x */
function regress(pts){
  const n = pts.length; if (n < 4) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  pts.forEach(([x,y]) => { sx += x; sy += y; sxx += x*x; sxy += x*y; });
  const d = n*sxx - sx*sx; if (!d) return null;
  const slope = (n*sxy - sx*sy)/d;
  return {slope, icpt:(sy - slope*sx)/n};
}
/* اتجاه سرعة التسليم: انحدار موقع التسليم من الموعد على الزمن خلال آخر 8 أسابيع.
   المخرجات المتأخرة التي لم تُسلَّم بعد تُحتسب اليوم بتأخرها الحالي (أقل تقدير لتأخرها).
   تُقيَّد كل قيمة بين −5 و+5 أيام حتى لا يطغى مخرج شاذ واحد على الاتجاه. */
function velocityTrend(id){
  return memo("vt"+id, () => {
    const today = todayISO(), from = isoOffset(-56), c = state.config;
    const pts = events().filter(x => x.emp===id && (x.completedAt ? x.completedAt >= from : x.deadline >= from))
      .map(x => x.completedAt ? [daysBetween(today, x.completedAt), clamp(daysBetween(x.completedAt, x.deadline), -5, 5)] : [0, clamp(daysBetween(today, x.deadline), -5, 5)]);
    const r = regress(pts); if (!r) return null;
    return {n:pts.length, slopeWeek:r.slope*7, now:r.icpt, projected:r.icpt + r.slope*c.predictHorizon};
  });
}

/* =========================================================
   6) الأهلية والتوصيات
   ========================================================= */
const SUIT = {
  full:{label:"قابلة للعمل عن بعد كلياً",short:"قابلة كلياً"},
  partial:{label:"قابلة للعمل عن بعد جزئياً",short:"قابلة جزئياً"},
  onsite:{label:"تتطلب الحضور",short:"حضورية"}
};
function allowedDays(e){ const s = roleOf(e).suit, c = state.config; return s==="full" ? c.daysFull : s==="partial" ? c.daysPartial : 0; }
function gates(e){
  const c = state.config, p = points(e.id), suit = roleOf(e).suit;
  const items = [
    {key:"probation",ok:e.probationDone,label:"اجتياز فترة التجربة الوظيفية"},
    {key:"charter",  ok:e.charterSigned,label:"توقيع ميثاق العمل عن بعد"},
    {key:"home",     ok:e.homeReady,    label:"إقرار جاهزية مكان العمل في المنزل"},
    {key:"security", ok:hasVerified(e.id,REQUIRED()),label:"شهادة أمن المعلومات (موثقة)"}
  ];
  return { p, items,
    g1:{ok:suit!=="onsite", note:SUIT[suit].short},
    g2:{ok:items.every(i => i.ok), note:items.filter(i => i.ok).length+" من 4"},
    g3:{ok:p>=c.remoteMin, mid:p>=c.officeMin && p<c.remoteMin, note:p+" من "+c.remoteMin} };
}
const REC = {
  remote:    {label:"مؤهل للعمل عن بعد",      cls:"remote", icon:"home",     target:"remote"},
  review:    {label:"قيد المراجعة",           cls:"review", icon:"clock",    target:null},
  office:    {label:"يلزم بالعمل حضورياً",    cls:"office", icon:"building", target:"onsite"},
  prereq:    {label:"متطلبات غير مكتملة",     cls:"prereq", icon:"list",     target:"onsite"},
  onsiteRole:{label:"وظيفة حضورية بطبيعتها",  cls:"neutral",icon:"building", target:"onsite"}
};
function recommend(e){
  const g = gates(e), c = state.config;
  if (!g.g1.ok) return "onsiteRole";
  if (!g.g2.ok) return "prereq";
  if (g.p >= c.remoteMin) return "remote";
  if (g.p <  c.officeMin) return "office";
  return "review";
}
function recReason(e){
  const g = gates(e), c = state.config, r = recommend(e);
  if (r==="onsiteRole") return `الوظيفة (${roleOf(e).title}) مصنفة "${SUIT.onsite.label}". البديل المتاح: الساعات المرنة.`;
  if (r==="prereq") return "متطلبات غير مستوفاة: " + g.items.filter(i => !i.ok).map(i => i.label).join("، ") + ".";
  if (r==="remote") return `المتطلبات مستوفاة، والرصيد ${g.p} يبلغ حد العمل عن بعد (${c.remoteMin}).`;
  if (r==="office") return `الرصيد ${g.p} أقل من الحد الأدنى (${c.officeMin}).`;
  return `الرصيد ${g.p} بين الحد الأدنى (${c.officeMin}) وحد العمل عن بعد (${c.remoteMin})، فيبقى القرار المعتمد.`;
}
function targetDecision(e){ return REC[recommend(e)].target || e.decision.mode; }
function isPending(e){ const t = targetDecision(e); return t !== e.decision.mode && e.decision.heldFor !== recommend(e)+":"+t; }
function decisionText(e, mode){ mode = mode || e.decision.mode; return mode==="remote" ? `عن بعد حتى ${daysWord(allowedDays(e))} أسبوعياً` : "حضوري"; }
const modeWord = m => m==="remote" ? "عن بعد" : "حضوري";
const recallActive = e => !!(e.recall && e.recall.until >= todayISO());

/* =========================================================
   7) الإنذار المبكر الفعلي — يستند إلى ما حدث
   ---------------------------------------------------------
   أ) عدد المخرجات المتأخرة خلال آخر warnWindow يوماً ≥ warnLate
   ب) الالتزام في آخر 28 يوماً أقل من خط أساس الموظف بـ warnDrop نقطة مئوية أو أكثر (بحد أدنى 3 مخرجات)
   ========================================================= */
function warning(e){
  return memo("w"+e.id, () => {
    const c = state.config, from = isoOffset(-c.warnWindow), today = todayISO();
    const ev = events().filter(x => x.emp===e.id);
    const lateRecent = ev.filter(x => x.deadline >= from && x.deadline <= today && !x.onTime).length;
    const recent = ev.filter(x => x.deadline >= isoOffset(-28) && x.deadline <= today);
    const r = rate(recent), base = baselineOf(e.id);
    const drop = (r!=null && base!=null && recent.length>=3) ? Math.round((base - r)*100) : 0;
    const reasons = [];
    if (lateRecent >= c.warnLate) reasons.push(`${plural(lateRecent, ["مخرج متأخر واحد","مخرجان متأخران","مخرجات متأخرة","مخرجاً متأخراً"])} خلال آخر ${daysWord(c.warnWindow)}`);
    if (drop >= c.warnDrop) reasons.push(`الالتزام في آخر 4 أسابيع ${pctTxt(r)} مقابل خط أساسه ${pctTxt(base)} (انخفاض ${drop} نقطة مئوية)`);
    if (!reasons.length) return null;
    const handled = (e.interventions||[]).find(i => i.type!=="preventive" && i.date >= from);
    return {level:reasons.length>1 ? "high" : "medium", reasons, handled};
  });
}
function warnings(){ return memo("ws", () => state.employees.map(e => ({e, w:warning(e)})).filter(x => x.w)); }
function accountability(){ const ws = warnings(); return {total:ws.length, handled:ws.filter(x => x.w.handled).length}; }

/* =========================================================
   8) المحرك التحليلي المحلي
   ---------------------------------------------------------
   كل ما يلي يعمل داخل المتصفح بقواعد إحصائية شفافة وأوزان معلنة،
   دون أي نموذج سحابي أو إرسال للبيانات. النتائج اقتراحات استرشادية، والقرار للمدير.
   ========================================================= */
const AI_NOTE = "يعمل داخل المتصفح بقواعد إحصائية شفافة (انحدار خطي، ونسب، وأوزان معلنة)، دون أي نموذج سحابي أو إرسال للبيانات. نتائجه اقتراحات استرشادية، والقرار للمدير ويُوثَّق.";

/* 8.1) التنبؤ بخطر التأخر لمخرج مفتوح، قبل حلول موعده.
   الدرجة = 10 (أساس) + مجموع أوزان العوامل، من 0 إلى 100. */
function taskRisk(t){
  return memo("tr"+t.id, () => {
    const c = state.config, today = todayISO();
    if (taskState(t) !== "open") return null;
    const daysLeft = daysBetween(today, t.deadline);
    if (daysLeft > c.predictHorizon) return null;
    const remaining = 100 - (t.progress || 0), pace = remaining/Math.max(1, daysLeft);
    const f = [], add = (w, label) => { w = Math.round(w); if (w) f.push({w, label}); };
    add(clamp((pace-4)/12, 0, 1)*60, `يتبقى ${remaining}% من الإنجاز ${daysLeft<=0 ? "والموعد اليوم" : "خلال "+daysGen(daysLeft)} (يلزم ${fmt1(pace)}% يومياً)`);
    const vt = velocityTrend(t.emp);
    if (vt){
      if (vt.projected < -0.25) add(25, `اتجاه سرعة التسليم يشير إلى التسليم بعد الموعد (${leadTxt(vt.projected)})`);
      else if (vt.slopeWeek <= -0.4) add(12, `سرعة التسليم تتراجع بنحو ${fmt1(-vt.slopeWeek)} يوم أسبوعياً`);
      else if (vt.slopeWeek >= 0.4) add(-8, `سرعة التسليم تتحسن بنحو ${fmt1(vt.slopeWeek)} يوم أسبوعياً`);
    }
    const back = state.tasks.filter(x => x.emp===t.emp && x.id!==t.id && taskState(x)==="overdue" && !appealAccepted(x)).length;
    if (back) add(Math.min(20, back*10), back===1 ? "مخرج متأخر آخر لم يُسلَّم لدى الموظف" : back===2 ? "مخرجان متأخران آخران لم يُسلَّما" : `${back} مخرجات متأخرة أخرى لم تُسلَّم`);
    const rr = recentRate(t.emp), base = baselineOf(t.emp);
    if (rr!=null && base!=null && base - rr >= .1) add(10, `الالتزام في آخر 4 أسابيع (${pctTxt(rr)}) دون خط أساسه (${pctTxt(base)})`);
    else if (rr!=null && rr >= .85) add(-5, `سجل التزام قوي مؤخراً (${pctTxt(rr)})`);
    if (daysLeft <= 2 && t.progress < 50) add(10, "الموعد قريب جداً والإنجاز دون النصف");
    const score = clamp(10 + f.reduce((s,x) => s+x.w, 0), 0, 100);
    return {score, level: score>=75 ? "high" : score>=c.predictThreshold ? "medium" : "low", factors:f, daysLeft, pace};
  });
}
/* 8.2) قائمة المخاطر المتوقعة: مخرجات مفتوحة فوق الحد، أو انجراف في سرعة التسليم لدى موظف بلا إنذار فعلي */
function predictedRisks(){
  return memo("pred", () => {
    const c = state.config, out = [];
    state.employees.forEach(e => {
      const handled = (e.interventions||[]).find(i => i.type==="preventive" && i.date >= isoOffset(-7));
      const ts = state.tasks.filter(t => t.emp===e.id).map(t => ({t, r:taskRisk(t)})).filter(x => x.r && x.r.score >= c.predictThreshold);
      ts.forEach(({t,r}) => out.push({kind:"task", e, t, score:r.score, level:r.level, factors:r.factors, handled}));
      if (!ts.length && !warning(e)){
        const vt = velocityTrend(e.id);
        if (vt && vt.projected < -0.25 && vt.slopeWeek < 0){
          const w1 = Math.min(30, Math.round(-vt.projected*10)), w2 = Math.min(20, Math.round(-vt.slopeWeek*12));
          const score = clamp(10 + 35 + w1 + w2, 0, 100);
          if (score >= c.predictThreshold) out.push({kind:"drift", e, t:null, score, level:score>=75?"high":"medium", handled,
            factors:[{w:35, label:"اتجاه التسليم يعبر من قبل الموعد إلى ما بعده دون تأخر فعلي كافٍ لإنذار"},{w:w1, label:`موقع التسليم المتوقع بعد ${daysGen(c.predictHorizon)}: ${leadTxt(vt.projected)}`},
                     {w:w2, label:`تراجع بنحو ${fmt1(-vt.slopeWeek)} يوم أسبوعياً خلال آخر 8 أسابيع`}]});
        }
      }
    });
    return out.sort((a,b) => b.score - a.score);
  });
}

/* 8.3) المساعد التحليلي لتقييم مبررات الاعتراض: يقرأ السبب والنص والسياق ويقترح ولا يقرر */
const EVIDENCE_RX = /مرفق|بلاغ|تذكرة|رقم|بريد|صورة|لقطة|شهادة|تقرير|سجل|إشعار|مستند|موثق|مراسلة/;
const SPECIFIC_RX = /\d|يوم|أيام|يومين|ساعة|ساعات|ساعتين|تاريخ|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت/;
const INTERNAL_RX = /ضغط|انشغال|نسيت|نسيان|كثرة|لم أتمكن|لم يتسن|ظروف خاصة/;
const REASON_W = {
  "عطل تقني":[10,"سبب خارجي قابل للتحقق (عطل تقني)"],
  "وضع طارئ أو استمرارية أعمال":[12,"وضع طارئ خارج عن الإرادة"],
  "تغيير في نطاق التكليف أو موعده":[8,"تغيير في نطاق التكليف قابل للتوثيق"],
  "أخرى":[-8,"سبب غير مصنف"]
};
const VERIFY_STEP = {
  "عطل تقني":"اطلب رقم البلاغ من قسم تقنية المعلومات وطابق تاريخه مع فترة التأخر.",
  "وضع طارئ أو استمرارية أعمال":"تحقق من تزامن الوضع الطارئ مع موعد التكليف.",
  "تغيير في نطاق التكليف أو موعده":"راجع المراسلات التي غيّرت النطاق أو الموعد.",
  "أخرى":"اطلب من الموظف توضيحاً مكتوباً بدليل محدد قبل القرار."
};
function assessAppeal(t){
  return memo("apl"+t.id, () => {
    const a = t.appeal, f = [], add = (w, label) => f.push({w, label}), note = a.note || "";
    const rw = REASON_W[a.reason]; if (rw) add(rw[0], rw[1]);
    if (EVIDENCE_RX.test(note)) add(15, "يشير إلى دليل قابل للتحقق (بلاغ أو مرفق أو مراسلة)"); else add(-10, "لا يذكر أي دليل قابل للتحقق");
    if (SPECIFIC_RX.test(note)) add(8, "يحدد المدة أو التوقيت"); else add(-4, "يفتقر إلى تحديد زمني");
    if (INTERNAL_RX.test(note)) add(-8, "يشير إلى سبب داخلي يمكن التخطيط له مسبقاً");
    if (note.length < 25) add(-6, "التوضيح مقتضب");
    const lag = daysBetween(t.deadline, a.date);
    if (lag <= 3) add(6, lag <= 0 ? "قُدّم قبل الموعد أو يومه" : `قُدّم بعد الموعد ${byDays(lag)} فقط`);
    else if (lag > 7) add(-10, `قُدّم متأخراً، بعد الموعد ${byDays(lag)}`);
    if (t.progress >= 50) add(8, `إنجاز ملموس قبل التأخر (${t.progress}%)`); else if (t.progress < 25) add(-8, `إنجاز محدود (${t.progress}%)`);
    if (state.continuity.active && /طارئ/.test(a.reason)) add(15, "وضع استمرارية الأعمال مفعّل حالياً");
    const peers = a.reason==="أخرى" ? 0 : state.tasks.filter(x => x.emp!==t.emp && x.appeal && x.appeal.reason===a.reason && Math.abs(daysBetween(x.deadline, t.deadline)) <= 5).length;
    if (peers) add(10, "اعتراضات مماثلة من زملاء في الفترة نفسها");
    const rej = state.tasks.filter(x => x.emp===t.emp && x.id!==t.id && x.appeal && x.appeal.status==="rejected").length;
    if (rej) add(-Math.min(16, rej*8), rej===1 ? "اعتراض سابق مرفوض" : `${rej} اعتراضات سابقة مرفوضة`);
    const base = baselineOf(t.emp);
    if (base!=null && base >= .72) add(6, `سجل التزام جيد قبل التجربة (${pctTxt(base)})`);
    else if (base!=null && base < .6) add(-6, `سجل التزام ضعيف قبل التجربة (${pctTxt(base)})`);
    const score = clamp(Math.round(50 + f.reduce((s,x) => s+x.w, 0)), 0, 100);
    const verdict = score >= 65 ? "accept" : score >= 40 ? "verify" : "reject";
    const dist = Math.abs(score - 50);
    const label = {accept:"يُرجَّح القبول", verify:"يحتاج تحققاً إضافياً", reject:"يُرجَّح الرفض"}[verdict];
    const confidence = dist >= 30 ? "ثقة مرتفعة" : dist >= 15 ? "ثقة متوسطة" : "ثقة منخفضة";
    const next = verdict==="accept" ? "قبول الاعتراض، والاتفاق مع الموظف على موعد تسليم جديد واقعي."
      : verdict==="verify" ? (VERIFY_STEP[a.reason] || VERIFY_STEP["أخرى"])
      : "رفض الاعتراض بسبب مكتوب، مع الاتفاق على خطة تسليم بديلة.";
    const reply = `السبب المذكور (${a.reason}) لا يتضمن دليلاً يثبت أن التأخر خارج عن الإرادة` + (lag > 7 ? `، وقُدّم الاعتراض بعد الموعد ${byDays(lag)}` : "") + ". يُرجى تسليم المخرج وفق خطة متفق عليها مع المدير.";
    return {score, verdict, label, confidence, factors:f, next, reply};
  });
}

/* =========================================================
   9) مركز الإجراءات — قائمة موحّدة بكل ما ينتظر قرار المدير
   ========================================================= */
const KIND = {
  approval:  {label:"اعتماد نمط العمل", tab:"approvals",   icon:"home",     cls:"remote"},
  appeal:    {label:"اعتراض على خصم",  tab:"appeals",     icon:"scale",    cls:"prereq"},
  warning:   {label:"إنذار مبكر",       tab:"warnings",    icon:"alert",    cls:"office"},
  prediction:{label:"تنبؤ استباقي",     tab:"predictions", icon:"activity", cls:"review"},
  verify:    {label:"توثيق شهادة",      tab:"verify",      icon:"cap",      cls:"neutral"}
};
const TABS = [["all","الكل"],["approvals","الاعتمادات"],["appeals","الاعتراضات"],["warnings","الإنذارات"],["predictions","التنبؤات"],["verify","الشهادات"]];
function actionItems(){
  return memo("items", () => {
    const items = [], today = todayISO();
    state.employees.filter(isPending).forEach(e => items.push({kind:"approval", key:"ap-"+e.id, e, prio:1, age:null}));
    state.tasks.filter(t => t.appeal && t.appeal.status==="pending").forEach(t => {
      const age = daysBetween(t.appeal.date, today);
      items.push({kind:"appeal", key:"apl-"+t.id, t, e:empById(t.emp), age, prio:age>=3 ? 2 : 1});
    });
    warnings().filter(x => !x.w.handled).forEach(({e,w}) => items.push({kind:"warning", key:"w-"+e.id, e, w, prio:w.level==="high" ? 3 : 2, age:null}));
    predictedRisks().filter(p => !p.handled).forEach(p => items.push({kind:"prediction", key:"p-"+p.e.id+"-"+(p.t ? p.t.id : "d"), p, e:p.e, prio:2, age:null}));
    state.completions.filter(x => x.status==="pending").forEach(x => {
      const age = daysBetween(x.date, today);
      items.push({kind:"verify", key:"v-"+x.emp+"-"+x.course, x, e:empById(x.emp), age, prio:x.course===REQUIRED() ? 2 : 1});
    });
    return items.sort((a,b) => (b.prio - a.prio) || ((b.age||0) - (a.age||0)));
  });
}
const inboxCount = () => actionItems().length;

/* كل تعديل يمر من هنا: تنفيذ، حفظ، إعادة رسم، وإشعار بتغيّر التوصيات */
function mutate(fn){
  const before = {}; state.employees.forEach(e => before[e.id] = recommend(e));
  fn(); MEMO = {}; persist(); render();
  state.employees.forEach(e => {
    const r = recommend(e);
    if (before[e.id] !== r && (role()!=="employee" || e.id===SELF_ID))
      toast(`تغيّرت توصية ${e.name} إلى: ${REC[r].label}` + (isPending(e) ? " — بانتظار الاعتماد." : "."));
  });
}

/* =========================================================
   10) المؤشرات الاستراتيجية — كل مؤشر معرّف بصيغته
   ========================================================= */
function execStats(){
  return memo("st", () => {
    const c = state.config, ev = events(), today = todayISO();
    const B = ev.filter(inBaseline), P = ev.filter(inPilot);
    const rB = rate(B), rP = rate(P), n = state.employees.length;
    const wB = c.baselineWeeks, wP = Math.max(1, daysBetween(c.pilotStart, today))/7;
    const appP = P.filter(x => x.completedAt);
    const earlyP = appP.filter(x => daysBetween(x.completedAt, x.deadline) >= c.earlyDays).length;
    const otB = B.filter(x => x.onTime).length/(n*wB), otP = P.filter(x => x.onTime).length/(n*wP);
    let remoteDays = 0, hours = 0;
    state.employees.filter(e => e.decision.mode==="remote").forEach(e => {
      const days = Math.floor(Math.max(0, daysBetween(e.decision.date, today))/7 * allowedDays(e));
      remoteDays += days; hours += days * e.commuteMins/60;
    });
    return {rB, rP, delta:(rP!=null && rB!=null) ? Math.round((rP-rB)*100) : null,
            earlyPct:appP.length ? earlyP/appP.length : null, earlyN:earlyP, appN:appP.length,
            otB, otP, roi:otB ? otP/otB - 1 : null, remoteDays, hours:Math.round(hours), nB:B.length, nP:P.length};
  });
}
function weeklySeries(){
  return memo("wk", () => {
    const c = state.config, ev = events(), today = todayISO();
    const curW = Math.floor(daysBetween(c.pilotStart, today)/7), out = [];
    for (let w = -c.baselineWeeks; w <= curW; w++){
      const s = addDays(c.pilotStart, 7*w), e = addDays(c.pilotStart, 7*w+6);
      const xs = ev.filter(x => x.deadline >= s && x.deadline <= e && x.deadline <= today);
      const ap = xs.filter(x => x.completedAt);
      out.push({w, r:rate(xs), n:xs.length, k:xs.filter(x => x.onTime).length, ap:ap.length,
        ea:ap.filter(x => daysBetween(x.completedAt, x.deadline) >= c.earlyDays).length, partial:w===curW, s, e});
    }
    return out;
  });
}
function groupStats(){
  return memo("grp", () => {
    const ev = events();
    return [["remote","معتمدون للعمل عن بعد"],["onsite","يعملون حضورياً"]].map(([m,label]) => {
      const ids = state.employees.filter(e => e.decision.mode===m).map(e => e.id);
      const mine = ev.filter(x => ids.includes(x.emp));
      const b = rate(mine.filter(inBaseline)), p = rate(mine.filter(inPilot));
      return {m, label, n:ids.length, b, p, d:(b!=null && p!=null) ? Math.round((p-b)*100) : null};
    });
  });
}
function successCriteria(){
  return memo("crit", () => {
    const st = execStats(), s = state.survey;
    const rem = state.employees.filter(e => e.decision.mode==="remote");
    const cov = rem.filter(e => hasVerified(e.id, REQUIRED())).length;
    const acc = accountability();
    return [
      {n:"الالتزام بالمواعيد (مخرجات معتمدة في موعدها ÷ المخرجات المستحقة)", short:"الالتزام بالمواعيد", b:pctTxt(st.rB), v:pctTxt(st.rP), t:"لا يقل عن خط الأساس", ok:st.rP!=null && st.rP>=st.rB},
      {n:"رضا الموظفين (من 5)", short:"رضا الموظفين", b:s.sat[0], v:s.sat[1], t:"أعلى من خط الأساس", ok:s.sat[1]>s.sat[0], mock:true},
      {n:"ثقة المدراء في المتابعة (من 5)", short:"ثقة المدراء في المتابعة", b:s.conf[0], v:s.conf[1], t:"أعلى من خط الأساس", ok:s.conf[1]>s.conf[0], mock:true},
      {n:"حوادث أمن المعلومات", short:"حوادث أمن المعلومات", b:"—", v:state.incidents, t:"صفر", ok:state.incidents===0},
      {n:"العاملون عن بعد الحاصلون على شهادة أمن المعلومات", short:"تغطية شهادة أمن المعلومات", b:"—", v:`${cov} من ${rem.length}`, t:"جميعهم", ok:cov===rem.length},
      {n:"معدل المحاسبية (إنذارات عولجت بتدخل موثق ÷ إجمالي الإنذارات)", short:"معدل المحاسبية", b:"—", v:acc.total ? `${acc.handled} من ${acc.total}` : "لا إنذارات", t:"جميعها", ok:acc.handled===acc.total}
    ];
  });
}
function pilotInfo(){
  const c = state.config, elapsed = Math.max(0, daysBetween(c.pilotStart, todayISO()));
  return {week:Math.min(c.pilotWeeks, Math.floor(elapsed/7)+1), pct:Math.min(100, elapsed/(c.pilotWeeks*7)*100), end:addDays(c.pilotStart, c.pilotWeeks*7)};
}
function effectiveMode(e){
  const suit = roleOf(e).suit;
  if (state.continuity.active && suit!=="onsite") return {mode:"remote", why:"continuity"};
  if (recallActive(e)) return {mode:"onsite", why:"recall"};
  return {mode:e.decision.mode, why:"decision"};
}

/* 8.4) مولّد التقرير التنفيذي: يقرأ execStats() وsuccessCriteria() ويصوغ تقريراً استشارياً بالعربية */
function generateExecutiveSummary(){
  return memo("sum", () => {
    const st = execStats(), crit = successCriteria(), pi = pilotInfo(), c = state.config, today = todayISO();
    const met = crit.filter(x => x.ok), unmet = crit.filter(x => !x.ok);
    const acc = accountability(), ws = warnings(), preds = predictedRisks(), groups = groupStats();
    const final = pi.week >= c.pilotWeeks;
    const dir = st.delta==null ? "flat" : st.delta >= 3 ? "up" : st.delta <= -3 ? "down" : "flat";
    const nEmp = state.employees.length, remote = state.employees.filter(e => e.decision.mode==="remote").length;
    const roiTxt = st.roi==null ? "—" : (st.roi>=0 ? "+" : "−") + Math.abs(Math.round(st.roi*100)) + "%";

    const headline = {
      up:"العمل القائم على المخرجات رفع الالتزام بالمواعيد دون أثر سلبي على الإنتاجية",
      flat:"الإنتاجية حافظت على مستواها بعد تفعيل العمل عن بعد",
      down:"الالتزام بالمواعيد تراجع ويستدعي تدخلاً تصحيحياً قبل أي توسع"}[dir];
    const move = {
      up:`ارتفع الالتزام بالمواعيد إلى ${pctTxt(st.rP)} مقابل ${pctTxt(st.rB)} في خط الأساس الحضوري`,
      flat:`استقر الالتزام بالمواعيد عند ${pctTxt(st.rP)} مقابل ${pctTxt(st.rB)} في خط الأساس الحضوري`,
      down:`تراجع الالتزام بالمواعيد إلى ${pctTxt(st.rP)} مقابل ${pctTxt(st.rB)} في خط الأساس الحضوري`}[dir];
    const gapWord = n => n===1 ? "فجوة واحدة" : n===2 ? "فجوتين" : `${n} فجوات`;
    const reading = dir==="down"
      ? "لا تدعم النتائج حتى الآن قرار التوسع، ويلزم تحليل أسباب التراجع على مستوى الفرق والتكليفات قبل أي خطوة تالية."
      : unmet.length ? `تدعم النتائج الفرضية الأساسية للتجربة: يمكن قياس الإنتاجية بالمخرجات والمحافظة عليها خارج المقر، مع ${gapWord(unmet.length)} تستدعي المعالجة قبل قرار التوسع.`
      : "تدعم النتائج الفرضية الأساسية للتجربة: يمكن قياس الإنتاجية بالمخرجات والمحافظة عليها خارج المقر، دون فجوات مفتوحة في معايير النجاح.";
    const summary = [
      `مضى من التجربة ${plural(pi.week, W_WEEKS)} من أصل ${c.pilotWeeks}، في قسم تجريبي واحد يضم ${plural(nEmp, W_EMP)}${remote ? `، ويعمل ${remote} منهم عن بعد وفق قرارات معتمدة` : "، ولا يعمل أي منهم عن بعد حتى الآن"}.`,
      `${move} (${st.delta==null ? "—" : ptsTxt(st.delta)})، وتحقق ${met.length} من ${crit.length} معايير نجاح اعتُمدت قبل بدء التجربة.`,
      reading + (final ? "" : ` وهذه قراءة مرحلية، ويُتخذ القرار النهائي في ${fmtDateY(pi.end)}.`)
    ];
    const gR = groups[0], gO = groups[1];
    const findings = [
      {k:"الالتزام بالمواعيد", v:`${pctTxt(st.rP)} خلال التجربة من أصل ${st.nP} من المخرجات المستحقة، مقابل ${pctTxt(st.rB)} من أصل ${st.nB} قبلها.`},
      {k:"الإنجاز المبكر", v:`${pctTxt(st.earlyPct)} من المخرجات المعتمدة سُلِّمت قبل موعدها ${byDays(c.earlyDays)} أو أكثر (${st.earlyN} من ${st.appN}).`},
      {k:"العائد على المخرجات", v:`${roiTxt} في عدد المخرجات المسلَّمة في موعدها لكل موظف أسبوعياً، مقارنة بخط الأساس.`},
      {k:"الوقت المستعاد", v:`نحو ${plural(st.hours, W_HRS)} تنقل وُفّرت تقديرياً عبر ${plural(st.remoteDays, W_DAYS)} من العمل عن بعد المعتمد.`},
      {k:"المقارنة بين المجموعتين", v:`تغيّر التزام المعتمدين للعمل عن بعد بـ${gR.d==null ? "—" : ptsTxt(gR.d)}، مقابل ${gO.d==null ? "—" : ptsTxt(gO.d)} لمن يعملون حضورياً، كلٌّ مقارنة بخط أساسه.`}
    ];
    const risks = [];
    risks.push(ws.length ? `${plural(ws.length, ["إنذار مبكر واحد","إنذاران مبكران","إنذارات مبكرة","إنذاراً مبكراً"])} على أساس الأداء الفعلي، ${acc.handled ? `عولج منها ${acc.handled} بتدخل موثق` : "لم يُعالَج أي منها بتدخل موثق بعد"}.` : "لا توجد إنذارات مبكرة مفتوحة على أساس الأداء الفعلي.");
    if (preds.length){
      const top = preds[0];
      risks.push(`يرصد المحرك التنبؤي ${plural(preds.length, ["خطر تأخر محتمل واحد","خطري تأخر محتملين","مخاطر تأخر محتملة","خطر تأخر محتملاً"])} في أفق ${daysWord(c.predictHorizon)}، أعلاها لدى ${top.e.name}${top.t ? ` في "${top.t.title}"` : " في اتجاه سرعة التسليم"} بدرجة ${top.score} من 100.`.replace("، أعلاها لدى", preds.length===1 ? "، لدى" : "، أعلاها لدى"));
    }
    if (unmet.length) risks.push(`معايير لم تتحقق بعد: ${unmet.map(x => x.short).join("، ")}.`);
    risks.push(`حجم العينة محدود (${plural(nEmp, W_EMP)})، والمجموعتان غير مختارتين عشوائياً، فتُقرأ الفروق مؤشراً داعماً للقرار لا دليلاً سببياً. ومؤشرا الرضا والثقة مأخوذان من استبيان وهمي في هذا النموذج.`);

    let rec;
    if (dir==="down") rec = {tone:"office", label:"إعادة المعايرة قبل أي توسع", text:"تجميد التوسع، ومراجعة التكليفات ومواعيدها لدى الفرق المتراجعة، وتفعيل الاستدعاء الحضوري المؤقت حيث يتكرر التأخر، ثم إعادة القياس بالمعايير نفسها."};
    else if (!unmet.length) rec = final
      ? {tone:"remote", label:"التوسع التدريجي", text:"توسيع النموذج إلى قسمين إضافيين بالمعايير نفسها، مع بناء خط أساس حضوري لكل قسم جديد قبل تفعيل العمل عن بعد فيه."}
      : {tone:"remote", label:"الاستمرار والتحضير للتوسع", text:`مواصلة التجربة حتى نهايتها في ${fmtDateY(pi.end)} دون تعديل المعايير، والبدء في اختيار قسمين مرشحين للمرحلة التالية وبناء خط أساسهما.`};
    else rec = {tone:"review", label:"الاستمرار مع معالجة الفجوات", text:"مواصلة التجربة حتى نهايتها، وربط قرار التوسع بإغلاق الفجوات التالية خلال الأسابيع المتبقية."};
    const STEP = {
      "الالتزام بالمواعيد":"مراجعة توزيع التكليفات ومواعيدها لدى الفرق التي تراجع التزامها.",
      "رضا الموظفين":"عقد جلسات استماع قصيرة مع الموظفين لتحديد مصادر عدم الرضا.",
      "ثقة المدراء في المتابعة":"تدريب المدراء على قراءة المؤشرات واستخدام مركز الإجراءات أسبوعياً.",
      "حوادث أمن المعلومات":"مراجعة كل حادثة أمنية مع قسم تقنية المعلومات وتحديث الضوابط.",
      "تغطية شهادة أمن المعلومات":"إلزام العاملين عن بعد غير الحاصلين على شهادة أمن المعلومات بإتمامها خلال أسبوع.",
      "معدل المحاسبية":"معالجة الإنذارات المفتوحة بتدخل موثق خلال 48 ساعة."
    };
    const steps = unmet.map(x => STEP[x.short]).filter(Boolean);
    if (preds.length) steps.push("إجراء متابعات استباقية للمخرجات المعرضة للتأخر قبل حلول مواعيدها.");
    steps.push(`اعتماد قرار نهاية التجربة في ${fmtDateY(pi.end)} وفق المعايير المعتمدة مسبقاً، دون تعديلها بأثر رجعي.`);
    const method = `يُحسب الالتزام بالمواعيد بقسمة المخرجات المعتمدة في موعدها أو قبله على كل المخرجات التي حل موعدها، ويُقارن بخط أساس من ${plural(c.baselineWeeks, W_WEEKS)} حضورية سابقة، وتُستبعد المخرجات التي قُبل الاعتراض على تأخرها. ويعتمد التنبؤ على انحدار خطي لموقع التسليم من الموعد خلال آخر 8 أسابيع، وعلى ضغط الإنجاز المتبقي في التكليفات المفتوحة. ولا تقيس هذه المؤشرات جودة المخرج بعد اعتماده، ولا التكاليف المالية، ولا أثر العمل عن بعد على التعاون غير الرسمي.`;
    const kpis = [
      {l:"الالتزام بالمواعيد", v:pctTxt(st.rP), s:`خط الأساس ${pctTxt(st.rB)}`},
      {l:"المخرجات المبكرة", v:pctTxt(st.earlyPct), s:`${st.earlyN} من ${st.appN}`},
      {l:"العائد على المخرجات", v:roiTxt, s:"مقارنة بخط الأساس"},
      {l:"معايير النجاح", v:`${met.length}/${crit.length}`, s:"محققة حتى الآن"}
    ];
    const ref = "MDA-" + today.replace(/-/g,"") + "-W" + pi.week;
    const phase = final ? "تقرير ختامي" : `قراءة مرحلية في الأسبوع ${pi.week} من ${c.pilotWeeks}`;
    const title = "تقرير تنفيذي: تجربة العمل عن بعد القائم على المخرجات";
    const text = [title, `${phase}، ${fmtDateY(today)}، المرجع ${ref}`, "", headline, "",
      "1. الخلاصة التنفيذية", ...summary, "",
      "2. النتائج الرئيسية", ...findings.map(f => `- ${f.k}: ${f.v}`), "",
      "3. المخاطر ونقاط الانتباه", ...risks.map(r => "- " + r), "",
      "4. التوصية", `${rec.label}: ${rec.text}`, ...steps.map((s,i) => `${i+1}) ${s}`), "",
      "5. المنهجية وحدود القياس", method, "",
      "وُلِّد محلياً بواسطة محرك مدى التحليلي داخل المتصفح، دون إرسال أي بيانات. بيانات وهمية للعرض."].join("\n");
    return {ref, date:today, title, phase, headline, kpis, summary, findings, risks, rec, steps, method, text, dir};
  });
}

/* =========================================================
   11) مكونات العرض
   ========================================================= */
const badge = r => `<span class="badge b-${REC[r].cls}">${ICON[REC[r].icon]}${REC[r].label}</span>`;
const deltaChip = n => `<span class="delta ${n>0?"pos":n<0?"neg":"zero"}"><bdi dir="ltr">${signed(n)}</bdi></span>`;
const trendChip = d => { if (d==null) return ""; const m = Math.abs(d) % 100; return `<span class="delta ${d>0?"pos":d<0?"neg":"zero"}">${d>0?ICON.trendUp:d<0?ICON.trendDown:""}<bdi dir="ltr">${signed(d)}</bdi> ${(m>=3 && m<=10) ? "نقاط" : "نقطة"}</span>`; };
const stIcon = s => s==="ok" ? ICON.check : s==="mid" ? ICON.dash : ICON.x;
const stText = s => s==="ok" ? "مستوفاة" : s==="mid" ? "مستوفاة جزئياً" : "غير مستوفاة";
const mockTag = () => `<span class="pill pill-review">${ICON.info}بيانات وهمية للعرض</span>`;
const aiTag = label => `<button type="button" class="ai-tag" data-tip="${tip(`<div class="tip-h">${ICON.sparkles}كيف يعمل التحليل؟</div><p>${AI_NOTE}</p>`)}" aria-label="${label||"تحليل ذكي محلي"}: ${AI_NOTE}">${ICON.sparkles}${label||"تحليل ذكي محلي"}</button>`;
const prioPill = p => p>=3 ? `<span class="pill pill-no">عاجل</span>` : p===2 ? `<span class="pill pill-review">مرتفع</span>` : `<span class="pill pill-neutral">عادي</span>`;
const INTERVENTION_LABEL = {recall:"استدعاء حضوري مؤقت", followup:"متابعة موثقة", preventive:"إجراء استباقي"};

function gauge(e, large){
  const c = state.config, p = points(e.id), r = recommend(e);
  const max = Math.max(100, c.remoteMin+10, p), pc = v => clamp(v/max*100, 0, 100);
  return `<div class="gauge${large?" lg":""}">
    <div class="gauge-track${large?" labeled":""}" role="img" aria-label="الرصيد ${p} نقطة. الحد الأدنى ${c.officeMin}، وحد العمل عن بعد ${c.remoteMin}">
      <div class="gauge-fill f-${REC[r].cls}" style="inline-size:${pc(p)}%"></div>
      <span class="tick min" style="inset-inline-start:${pc(c.officeMin)}%"></span>
      <span class="tick" style="inset-inline-start:${pc(c.remoteMin)}%"></span>
      ${large ? `<span class="tick-l" style="inset-inline-start:${pc(c.officeMin)}%" aria-hidden="true">${c.officeMin}</span><span class="tick-l" style="inset-inline-start:${pc(c.remoteMin)}%" aria-hidden="true">${c.remoteMin}</span>` : ""}
    </div>
    <span class="pts num">${p}<small> نقطة</small></span>
  </div>`;
}
function gatesHTML(e, compact){
  const g = gates(e);
  const list = [
    {n:1,t:"الوظيفة",  s:g.g1.ok?"ok":"no",note:g.g1.note},
    {n:2,t:"المتطلبات",s:g.g2.ok?"ok":"no",note:g.g2.note},
    {n:3,t:"الأداء",   s:g.g3.ok?"ok":g.g3.mid?"mid":"no",note:g.g3.note+" نقطة"}
  ];
  return `<ol class="gates${compact?" compact":""}" aria-label="بوابات الأهلية">${list.map(x => `
    <li class="gate ${x.s}"><div class="gate-top"><span class="st">${stIcon(x.s)}</span><span>${x.n}. ${x.t}</span></div>
    <small>${esc(x.note)}، ${stText(x.s)}</small></li>`).join("")}</ol>`;
}
function ledgerHTML(e){
  return `<details><summary>سجل النقاط</summary><ul class="ledger">${
    ledger(e.id).map(r => `<li><span>${esc(r.label)}</span>${deltaChip(r.delta)}</li>`).join("")}</ul></details>`;
}
function pageHead(title, sub, o){
  o = o || {};
  return `<header class="page-head"><div><h1 id="page-title" tabindex="-1">${title}</h1>${sub?`<p class="lede">${sub}</p>`:""}</div>${o.actions?`<div class="head-actions">${o.actions}</div>`:""}</header>`;
}
function card(o){
  const hid = o.hid || uid("h");
  return `<section class="card ${o.cls||""}" aria-labelledby="${hid}"${o.id?` id="${o.id}"`:""}>
    <div class="card-head"><div class="${o.icon?"has-ic":""}"><h2 id="${hid}">${o.icon?`<span class="ic ${o.ic||""}">${ICON[o.icon]}</span>`:""}<span>${o.title}</span></h2>${o.sub?`<p>${o.sub}</p>`:""}</div>${o.actions?`<div class="ch-actions">${o.actions}</div>`:""}</div>
    ${o.body}</section>`;
}
function continuityBanner(){
  const k = state.continuity; if (!k.active) return "";
  return `<div class="banner" role="status">${ICON.alert}<div><b>وضع استمرارية الأعمال مفعّل</b>: ${esc(k.reason)}${k.until?` حتى ${fmtDateY(k.until)}`:""}.
    <span class="small muted">الوظائف القابلة للعمل عن بعد تعمل عن بعد مؤقتاً، والاستدعاءات الحضورية معلقة خلال هذه المدة.</span></div></div>`;
}
/* خط الأفق: خط الأساس وموقع الأداء الحالي على مسطرة واحدة */
function horizonHTML(base, cur){
  if (base==null || cur==null) return "";
  const pb = base*100, pc = cur*100, lo = Math.min(pb,pc), hi = Math.max(pb,pc), up = cur >= base;
  return `<div class="horizon" role="img" aria-label="خط الأساس ${pctTxt(base)}، والأداء خلال التجربة ${pctTxt(cur)}">
    <div class="hz-track"><span class="hz-seg ${up?"up":"down"}" style="inset-inline-start:${lo}%;inline-size:${Math.max(.6,hi-lo)}%"></span>
      <span class="hz-mark base" style="inset-inline-start:${pb}%"><i></i><b>خط الأساس ${pctTxt(base)}</b></span>
      <span class="hz-mark cur" style="inset-inline-start:${pc}%;--from:${pb}%"><i></i><b>خلال التجربة ${pctTxt(cur)}</b></span></div>
    <div class="hz-scale" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div></div>`;
}
function sparkline(vals){
  const n = vals.length, real = vals.filter(v => v!=null);
  if (n < 2 || real.length < 2) return "";
  const lo = Math.min(...real) - .04, hi = Math.max(...real) + .04, W = 120, H = 36, P = 3;
  const xs = i => W - P - i*(W-2*P)/(n-1), ys = v => H - P - (v-lo)/(hi-lo||1)*(H-2*P);
  const pts = vals.map((v,i) => v==null ? null : [xs(i), ys(v)]).filter(Boolean);
  const line = "M" + pts.map(p => p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" L");
  const area = line + ` L${pts[pts.length-1][0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="sa" d="${area}"/><path class="sl" d="${line}"/></svg>`;
}

/* ---------- المخطط الأسبوعي التفاعلي (SVG) ---------- */
const wkLabel = wk => wk.w < 0
  ? (-wk.w===1 ? "قبل التجربة بأسبوع" : -wk.w===2 ? "قبل التجربة بأسبوعين" : `قبل التجربة بـ${plural(-wk.w, W_WEEKS)}`)
  : `أسبوع التجربة ${wk.w+1}${wk.partial ? " (جارٍ)" : ""}`;
function weeklyChartSVG(){
  const ws = weeklySeries(), base = execStats().rB;
  const W = 720, H = 300, pT = 32, pB = 46, pR = 52, pL = 12;
  const pw = W-pR-pL, ph = H-pT-pB, slot = pw/ws.length, bw = Math.min(34, slot*.56);
  const x = i => W - pR - slot*(i+.5);              /* الزمن يسير من اليمين إلى اليسار */
  const y = r => pT + ph*(1-r), last = ws.length-1;
  let g = `<defs>
    <linearGradient id="g-pilot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/></linearGradient>
    <pattern id="p-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="7" class="hatch-line"/></pattern>
    <filter id="f-glow" x="-60%" y="-30%" width="220%" height="160%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  [0,.25,.5,.75,1].forEach(v => {
    g += `<line class="grid" x1="${pL}" x2="${W-pR}" y1="${y(v)}" y2="${y(v)}"/>`;
    g += `<text class="axis" x="${W-pR+10}" y="${y(v)+4}" text-anchor="start">${Math.round(v*100)}%</text>`;
  });
  const i0 = ws.findIndex(wk => wk.w===0);
  if (i0 > 0){
    const dx = (x(i0-1)+x(i0))/2;
    g += `<line class="divider" x1="${dx}" x2="${dx}" y1="${pT-12}" y2="${H-pB}"/><text class="divider-t" x="${dx}" y="${pT-18}" text-anchor="middle">بدء التجربة</text>`;
  }
  ws.forEach((wk,i) => {
    const kind = wk.w<0 ? "b" : wk.partial ? "c" : "p", label = wkLabel(wk);
    const diff = (wk.r!=null && base!=null) ? Math.round((wk.r-base)*100) : null;
    const html = `<div class="tip-h"><span class="dot dot-${kind}"></span>${label}</div>
      <div class="tip-row"><span>الفترة</span><b>${fmtDate(wk.s)} – ${fmtDate(wk.e)}</b></div>
      <div class="tip-row"><span>المخرجات المستحقة</span><b class="num">${wk.n}</b></div>
      <div class="tip-row"><span>سُلِّمت في موعدها</span><b class="num">${wk.k}</b></div>
      <div class="tip-row"><span>نسبة الالتزام</span><b class="num">${pctTxt(wk.r)}</b></div>
      ${diff!=null ? `<div class="tip-sep"></div><div class="tip-row"><span>مقارنة بخط الأساس</span><b class="num ${diff>=0?"c-remote":"c-office"}">${ptsTxt(diff)}</b></div>` : ""}
      ${wk.partial ? `<p class="tip-note">أسبوع جارٍ: الأرقام جزئية حتى نهايته.</p>` : ""}`;
    const aria = `${label}: ${wk.r==null ? "لا مخرجات مستحقة" : `الالتزام ${pctTxt(wk.r)}، ${wk.k} من ${wk.n} مخرجات في موعدها`}`;
    g += `<g class="wk" data-i="${i}" data-rove-item tabindex="${i===last?0:-1}" role="img" aria-label="${esc(aria)}" data-tip="${tip(html)}">
      <rect class="hit" x="${(x(i)-slot/2+2).toFixed(1)}" y="${pT-8}" width="${(slot-4).toFixed(1)}" height="${ph+8}" rx="8"/>`;
    if (wk.r!=null){
      const hgt = Math.max(2, ph*wk.r);
      g += `<rect class="bar ${kind}" data-anchor x="${(x(i)-bw/2).toFixed(1)}" y="${(pT+ph-hgt).toFixed(1)}" width="${bw.toFixed(1)}" height="${hgt.toFixed(1)}" rx="5"/>
        <text class="val" x="${x(i).toFixed(1)}" y="${(pT+ph-hgt-7).toFixed(1)}" text-anchor="middle">${Math.round(wk.r*100)}</text>`;
    } else g += `<rect class="bar empty" data-anchor x="${(x(i)-bw/2).toFixed(1)}" y="${pT+ph-2}" width="${bw.toFixed(1)}" height="2" rx="1"/>`;
    g += `<text class="axis" x="${x(i).toFixed(1)}" y="${H-pB+20}" text-anchor="middle">${wk.w<0 ? "−"+(-wk.w) : wk.w+1}</text></g>`;
  });
  if (base!=null) g += `<line class="baseline" x1="${pL}" x2="${W-pR}" y1="${y(base)}" y2="${y(base)}"/>`;
  /* خط الاتجاه: متوسط متحرك لثلاثة أسابيع (مرجّح بعدد المخرجات) */
  const pts = ws.map((wk,i) => {
    const win = ws.slice(Math.max(0,i-2), i+1), n = win.reduce((s,v) => s+v.n, 0), k = win.reduce((s,v) => s+v.k, 0);
    return n ? [x(i).toFixed(1), y(k/n).toFixed(1)] : null;
  }).filter(Boolean);
  if (pts.length > 1) g += `<path class="trend" d="M${pts.map(p => p.join(" ")).join(" L")}"/>` + pts.map(p => `<circle class="trend-dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join("");
  const desc = `الالتزام بالمواعيد أسبوعياً: ${ws.map(wk => (wk.w<0 ? "قبل "+(-wk.w) : "أسبوع "+(wk.w+1))+" "+pctTxt(wk.r)).join("، ")}.`;
  return `<div class="chart-wrap" data-rove="chart"><svg class="chart" viewBox="0 0 ${W} ${H}" direction="ltr" role="group" aria-labelledby="ch-t" aria-describedby="ch-d"><title id="ch-t">الالتزام بالمواعيد أسبوعياً قبل التجربة وخلالها</title><desc id="ch-d">${esc(desc)}</desc>${g}</svg></div>
    <p class="chart-hint">مرّر المؤشر فوق أي عمود، أو انتقل إليه بمفتاح Tab ثم تنقّل بين الأسابيع بالأسهم.</p>`;
}
function weeklyTable(){
  return `<details style="margin-top:12px"><summary>عرض البيانات كجدول</summary><div class="table-wrap"><table class="data-table">
    <thead><tr><th scope="col">الأسبوع</th><th scope="col">الفترة</th><th scope="col">المخرجات المستحقة</th><th scope="col">في موعدها</th><th scope="col">الالتزام بالمواعيد</th></tr></thead>
    <tbody>${weeklySeries().map(wk => `<tr><td data-label="الأسبوع" class="num">${wk.w<0?"−"+(-wk.w):wk.w+1}</td>
      <td data-label="الفترة">${wk.w<0?"قبل التجربة (حضوري)":wk.partial?"التجربة، أسبوع جارٍ":"التجربة"}</td>
      <td data-label="المخرجات" class="num">${wk.n}</td><td data-label="في موعدها" class="num">${wk.k}</td><td data-label="الالتزام" class="num">${pctTxt(wk.r)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function groupCompareHTML(){
  const bar = (label, r, cls, g, when) => `<div class="cmp-bar"><span>${label}</span><div class="cmp-track" data-tip="${tip(`<div class="tip-h">${esc(g.label)}</div><div class="tip-row"><span>${when}</span><b class="num">${pctTxt(r)}</b></div><div class="tip-row"><span>عدد الموظفين</span><b class="num">${g.n}</b></div>`)}"><span class="${cls}" style="inline-size:${r==null?0:r*100}%"></span></div><b class="num">${pctTxt(r)}</b></div>`;
  return `<div class="compare">${groupStats().map(g => `<div class="cmp-row">
      <h3>${g.label} <small class="num">(${plural(g.n, W_EMP)})</small></h3>
      ${bar("قبل التجربة", g.b, "b", g, "الالتزام قبل التجربة")}${bar("خلال التجربة", g.p, "p"+(g.m==="onsite"?" onsite":""), g, "الالتزام خلال التجربة")}
      <p class="small muted" style="margin-top:6px">التغير: ${g.d==null ? "—" : ptsTxt(g.d)}</p></div>`).join("")}</div>
    <p class="small muted" style="margin-top:14px">المجموعتان صغيرتان وغير مختارتين عشوائياً، فالمقارنة مؤشر يدعم القرار ولا تثبت السببية وحدها.</p>`;
}

/* ---------- شارة الخطر التفاعلية ---------- */
function factorList(fs, mode){
  /* mode = "risk": الوزن الموجب يرفع الخطر (أحمر) | "appeal": الوزن الموجب يدعم القبول (أخضر) */
  return `<ul class="factors">${fs.map(f => {
    const good = mode==="risk" ? f.w < 0 : f.w > 0;
    return `<li><span class="fw ${good?"pos":"neg"}" dir="ltr">${f.w>0?"+":"−"}${Math.abs(f.w)}</span><span>${esc(f.label)}</span></li>`;
  }).join("")}</ul>`;
}
function riskBadge(p){
  const lab = p.level==="high" ? "خطر تأخر مرتفع" : "خطر تأخر متوقع";
  const html = `<div class="tip-h">${ICON.activity}درجة الخطر المتوقعة: <span class="num">${p.score}</span> من 100</div>
    ${p.t ? `<div class="tip-row"><span>التكليف</span><b>${esc(p.t.title)}</b></div><div class="tip-row"><span>الموعد</span><b>${fmtDate(p.t.deadline)}</b></div><div class="tip-row"><span>الإنجاز الحالي</span><b class="num">${p.t.progress}%</b></div>` : `<div class="tip-row"><span>النوع</span><b>انجراف في سرعة التسليم</b></div>`}
    <div class="tip-sep"></div>${factorList(p.factors, "risk")}
    <p class="tip-note">مجموع أوزان معلنة فوق أساس 10 نقاط؛ يُنبَّه عند ${state.config.predictThreshold} فأكثر.</p>`;
  return `<button type="button" class="risk ${p.level}" data-tip="${tip(html)}" aria-label="${lab}: ${p.score} من 100. العوامل: ${esc(p.factors.map(f => f.label).join("، "))}"><span class="pulse" aria-hidden="true"></span>${lab} <b class="num">${p.score}</b></button>`;
}

/* ---------- رادار المخاطر: الإنذار الفعلي والتنبؤ الاستباقي ---------- */
function riskRadarHTML(readOnly){
  const ws = warnings(), preds = predictedRisks(), acc = accountability(), c = state.config;
  const wl = ws.length ? `<ul class="warn-list">${ws.map(({e,w}) => {
    const eff = effectiveMode(e);
    let act;
    if (w.handled) act = `<span class="handled">${ICON.check}تم التدخل: ${INTERVENTION_LABEL[w.handled.type]}، ${fmtDate(w.handled.date)}</span>`;
    else if (!readOnly) act = `<span class="actions">${e.decision.mode==="remote" && !recallActive(e)
        ? `<button class="btn btn-sm btn-danger" type="button" data-act="recall" data-id="${e.id}">استدعاء حضوري مؤقت</button>` : ""}
        <button class="btn btn-sm btn-ghost" type="button" data-act="followup" data-id="${e.id}">تسجيل متابعة</button></span>`;
    else act = `<span class="pill pill-review">بانتظار تدخل المدير</span>`;
    return `<li class="warn"><div class="warn-top"><span><b>${esc(e.name)}</b> <span class="small muted">${eff.mode==="remote"?"يعمل عن بعد":"يعمل حضورياً"}${eff.why==="recall"?" (استدعاء مؤقت)":""}</span></span>
      <span class="lvl ${w.level}">${ICON.alert}${w.level==="high"?"خطر مرتفع":"خطر متوسط"}</span></div>
      <ul class="reasons">${w.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul><div>${act}</div></li>`;
  }).join("")}</ul>` : `<p class="empty">${ICON.check}لا يوجد موظف تجاوز حدود الإنذار حالياً.</p>`;
  const pl = preds.length ? `<ul class="warn-list">${preds.map(p => {
    const act = p.handled ? `<span class="handled">${ICON.check}إجراء استباقي موثق، ${fmtDate(p.handled.date)}</span>`
      : readOnly ? `<span class="small muted">بانتظار إجراء استباقي من المدير</span>`
      : `<button class="btn btn-sm btn-ghost" type="button" data-act="preventive" data-id="${p.e.id}"${p.t?` data-task="${p.t.id}"`:""}>${ICON.bolt}إجراء استباقي</button>`;
    return `<li class="warn"><div class="warn-top"><span><b>${esc(p.e.name)}</b> <span class="small muted">${p.t ? `${esc(p.t.title)}، موعده ${fmtDate(p.t.deadline)}` : "انجراف في سرعة التسليم"}</span></span>${riskBadge(p)}</div><div>${act}</div></li>`;
  }).join("")}</ul>` : `<p class="empty">${ICON.check}لا مخاطر متوقعة فوق الحد في أفق ${daysWord(c.predictHorizon)}.</p>`;
  return card({title:"رادار المخاطر", icon:"activity", ic:"office", actions:aiTag(),
    sub:"الإنذار الفعلي يرصد ما حدث، والتنبؤ يرصد ما قد يحدث قبل وقوعه",
    body:`<div class="acc-line"><span>معدل المحاسبية: <b class="num">${acc.total ? `${acc.handled} من ${acc.total}` : "لا إنذارات"}</b> عولجت بتدخل موثق</span>
      <span class="small muted">الحدود: ${c.warnLate} تأخر خلال ${daysWord(c.warnWindow)}، أو انخفاض ${c.warnDrop} نقطة عن خط الأساس، أو درجة تنبؤ ${c.predictThreshold}+</span></div>
      <h3 class="sub-h" style="margin-top:16px">الإنذارات الفعلية <span class="count num">${ws.length}</span></h3>${wl}
      <h3 class="sub-h">التنبؤات الاستباقية <span class="count num">${preds.length}</span></h3>${pl}`});
}

/* ---------- سرعة الإنجاز: مخطط الدمبل التفاعلي ---------- */
function velocityRow(e){
  const v = velocity(e.id), vt = velocityTrend(e.id);
  const pos = d => (5 - clamp(d,-5,5))/10*100;
  const diff = v.cur!=null && v.prev!=null ? v.cur - v.prev : null;
  const diffTxt = diff==null ? "—" : Math.abs(diff) < 0.1 ? "دون تغيير" : diff > 0 ? `أسرع بـ${fmt1(diff)} يوم` : `أبطأ بـ${fmt1(diff)} يوم`;
  let viz;
  if (v.cur==null && v.prev==null) viz = `<p class="small muted">لا توجد مخرجات معتمدة كافية للمقارنة.</p>`;
  else {
    const pc = v.cur!=null ? pos(v.cur) : null, pp = v.prev!=null ? pos(v.prev) : null;
    const ticks = [-4,-3,-2,-1,0,1,2,3,4].map(d => `<span class="db-tick${d===0?" zero":""}" style="inset-inline-start:${pos(d)}%"></span>`).join("");
    const tipDot = (title, val, n, other) => `<div class="tip-h">${title}</div>
      <div class="tip-row"><span>متوسط موقع الاعتماد</span><b>${leadTxt(val)}</b></div>
      <div class="tip-row"><span>القيمة الدقيقة</span><b class="num" dir="ltr">${val>=0?"+":"−"}${fmt1(val)} يوم</b></div>
      <div class="tip-row"><span>عدد المخرجات</span><b class="num">${n}</b></div>
      ${other!=null ? `<div class="tip-sep"></div><div class="tip-row"><span>الفرق بين الفترتين</span><b class="${diff>=0?"c-remote":"c-office"}">${diffTxt}</b></div>` : ""}`;
    const link = pc!=null && pp!=null && Math.abs(pc-pp) > .2
      ? `<span class="db-link ${v.cur>=v.prev?"up":"down"}" style="inset-inline-start:${Math.min(pc,pp)}%;inline-size:${Math.abs(pc-pp)}%" data-tip="${tip(`<div class="tip-h">الفرق الزمني</div><div class="tip-row"><span>من</span><b>${leadTxt(v.prev)}</b></div><div class="tip-row"><span>إلى</span><b>${leadTxt(v.cur)}</b></div><div class="tip-sep"></div><div class="tip-row"><span>النتيجة</span><b class="${diff>=0?"c-remote":"c-office"}">${diffTxt}</b></div>`)}"></span>` : "";
    viz = `<div class="db">
        <span class="db-axis"></span>${ticks}${link}
        ${pp!=null ? `<button type="button" class="db-dot prev" style="inset-inline-start:${pp}%" data-tip="${tip(tipDot("الأسابيع الأربعة السابقة", v.prev, v.nPrev, v.cur))}" aria-label="${esc(e.name)}، الأسابيع الأربعة السابقة: ${leadTxt(v.prev)}، من ${v.nPrev} مخرجات"></button>` : ""}
        ${pc!=null ? `<button type="button" class="db-dot cur" style="inset-inline-start:${pc}%" data-tip="${tip(tipDot("آخر 4 أسابيع", v.cur, v.nCur, v.prev))}" aria-label="${esc(e.name)}، آخر 4 أسابيع: ${leadTxt(v.cur)}، من ${v.nCur} مخرجات. ${diffTxt}"></button>` : ""}
      </div>
      <div class="db-scale" aria-hidden="true">${[4,2,0,-2,-4].map(d => `<span style="inset-inline-start:${pos(d)}%"><bdi dir="ltr">${d>0?"+"+d:d<0?"−"+(-d):"0"}</bdi></span>`).join("")}</div>
      <div class="db-cap" aria-hidden="true"><span>قبل الموعد</span><span>بعد الموعد</span></div>`;
  }
  const trend = diff==null ? "" : Math.abs(diff) < 0.1 ? `<span class="pill pill-neutral">ثابت</span>`
    : diff > 0 ? `<span class="pill pill-ok">${ICON.trendUp}أسرع بـ${fmt1(diff)} يوم</span>` : `<span class="pill pill-no">${ICON.trendDown}أبطأ بـ${fmt1(diff)} يوم</span>`;
  const proj = vt ? `<span class="trend-line">${vt.slopeWeek>=0?ICON.trendUp:ICON.trendDown}الاتجاه المتوقع بعد ${daysGen(state.config.predictHorizon)}: ${leadTxt(vt.projected)}</span>` : "";
  return `<li><div class="who-c"><b>${esc(e.name)}</b><small>${esc(roleOf(e).title)}</small></div><div>${viz}</div>
    <div class="vel-txt"><b>${leadTxt(v.cur)}</b> ${trend}<br><span class="muted">السابق: ${leadTxt(v.prev)}، <span class="num">${v.nCur}</span> مخرجات حالياً</span><br>${proj}</div></li>`;
}
function velocityHTML(list, compact){
  return card({title:"سرعة الإنجاز", icon:"gauge", ic:"teal",
    sub:"موقع اعتماد المخرج من موعده: آخر 4 أسابيع (نقطة ممتلئة) مقابل الأربعة السابقة (نقطة مفرغة). مرّر المؤشر أو انقر على أي نقطة لعرض القيم الدقيقة.",
    body:`<ul class="vel${compact?" compact":""}">${list.map(velocityRow).join("")}</ul>`});
}

/* =========================================================
   12) الصفحات
   ========================================================= */

/* ---------- صاحب القرار: اللوحة الاستراتيجية ---------- */
function pageExec(){
  const st = execStats(), pi = pilotInfo(), c = state.config, crit = successCriteria(), met = crit.filter(x => x.ok).length;
  const up = st.delta!=null && st.delta>=0, ws = weeklySeries(), sum = generateExecutiveSummary();
  const kpi = o => `<article class="kpi"><div class="k-top"><span class="k-label"><span class="ic ${o.ic||""}">${ICON[o.icon]}</span>${o.label}</span>${o.chip||""}</div>
    <span class="k-value num ${o.cls||""}">${o.value}</span><span class="k-ctx">${o.ctx}</span>${o.spark||""}
    <details><summary>كيف يُحسب</summary><p class="how">${o.how}</p></details></article>`;
  const earlySeries = ws.filter(w => w.w >= 0).map(w => w.ap ? w.ea/w.ap : null);
  return pageHead("اللوحة الاستراتيجية", `هل حافظت الإنتاجية على مستواها بعد تفعيل العمل عن بعد؟ تعرض اللوحة ما تحقق وما لم يتحقق في الأسبوع ${pi.week} من ${c.pilotWeeks} من التجربة.`,
      {actions:`${mockTag()}<button class="btn btn-primary" type="button" data-act="nav" data-page="report">${ICON.report}التقرير التنفيذي</button>`}) + `
  <div class="stack">
    <section class="card hero${up?"":" down"}" aria-labelledby="h-verdict">
      <span class="hero-glow" aria-hidden="true"></span>
      <div>
        <div class="hero-meta"><span class="pill ${up?"pill-ok":"pill-no"}">${up?ICON.trendUp:ICON.trendDown}${up?"الإنتاجية عند خط الأساس أو أعلى":"الإنتاجية دون خط الأساس"}</span><span class="small muted">قراءة مرحلية، الأسبوع ${pi.week} من ${c.pilotWeeks}</span></div>
        <h2 id="h-verdict" class="lead">خلال التجربة بلغ الالتزام بالمواعيد <span class="num">${pctTxt(st.rP)}</span> مقابل <span class="num">${pctTxt(st.rB)}</span> في الأسابيع الستة السابقة لها، بتغير ${st.delta==null?"—":ptsTxt(st.delta)}.</h2>
        ${horizonHTML(st.rB, st.rP)}
        <p class="note">محسوب من ${st.nP} من المخرجات المستحقة خلال التجربة، و${st.nB} قبلها.</p>
      </div>
      <div class="hero-side"><b class="num">${met}/${crit.length}</b><span>معايير نجاح محققة</span>
        <button class="btn btn-quiet btn-sm" type="button" data-act="nav" data-page="pilot">عرض المعايير</button></div>
    </section>

    <div class="kpis">
      ${kpi({label:"الالتزام بالمواعيد", icon:"target", ic:up?"remote":"office", value:pctTxt(st.rP), ctx:`خط الأساس الحضوري ${pctTxt(st.rB)}`, chip:trendChip(st.delta), cls:up?"c-remote":"c-office",
        spark:sparkline(ws.map(w => w.r)), how:"المخرجات المعتمدة في موعدها أو قبله ÷ كل المخرجات التي حل موعدها خلال التجربة. خط الأساس: النسبة نفسها في الأسابيع الستة السابقة للتجربة. الخط الصغير يعرض الأسابيع كلها."})}
      ${kpi({label:"مخرجات معتمدة قبل الموعد", icon:"bolt", value:pctTxt(st.earlyPct), ctx:`${st.earlyN} من ${st.appN} مخرجاً معتمداً`,
        spark:sparkline(earlySeries), how:`المخرجات المعتمدة قبل موعدها ${byDays(c.earlyDays)} أو أكثر ÷ كل المخرجات المعتمدة خلال التجربة.`})}
      ${kpi({label:"العائد على المخرجات", icon:"trendUp", ic:st.roi>=0?"remote":"office", value:st.roi==null ? "—" : `<bdi dir="ltr">${(st.roi>=0?"+":"−")+Math.abs(Math.round(st.roi*100))}%</bdi>`, ctx:"مخرجات في الموعد لكل موظف أسبوعياً، مقارنة بخط الأساس",
        cls:st.roi>=0?"c-remote":"c-office", how:"(المخرجات المعتمدة في الموعد ÷ عدد الموظفين ÷ أسابيع التجربة) ÷ (النسبة نفسها قبل التجربة) − 1. لا يشمل التكاليف المالية."})}
      ${kpi({label:"الساعات الموفرة", icon:"clock", ic:"teal", value:plural(st.hours, W_HRS), ctx:`عبر ${plural(st.remoteDays, W_DAYS)} من العمل عن بعد المعتمد`, chip:`<span class="pill pill-neutral">تقديري</span>`,
        how:"أيام العمل عن بعد المعتمدة منذ تاريخ كل قرار × زمن التنقل ذهاباً وإياباً كما صرّح به الموظف. رقم تقديري لا يُحتسب وفراً مالياً."})}
    </div>

    ${card({title:"الالتزام بالمواعيد أسبوعياً", icon:"activity", sub:"خط الأساس الحضوري مقابل الأداء الفعلي خلال التجربة، مع خط الاتجاه لثلاثة أسابيع",
      body: weeklyChartSVG() + `<div class="legend"><span><i class="sw b"></i>قبل التجربة (حضوري)</span><span><i class="sw p"></i>خلال التجربة</span><span><i class="sw c"></i>الأسبوع الجاري</span><span><i class="sw l"></i>متوسط خط الأساس <b class="num">${pctTxt(st.rB)}</b></span><span><i class="sw t"></i>الاتجاه (متوسط 3 أسابيع)</span></div>` + weeklyTable()})}

    <div class="grid-even">
      ${card({title:"العاملون عن بعد مقابل الحضوريين", icon:"users", sub:"كل مجموعة مقارنة بخط أساسها", body:groupCompareHTML()})}
      ${riskRadarHTML(true)}
    </div>

    ${card({title:"معايير النجاح المعتمدة مسبقاً", icon:"target", sub:`${met} من ${crit.length} محققة`,
      body:`<ul class="checklist">${crit.map(m => `<li><span class="st ${m.ok?"ok":"no"}">${stIcon(m.ok?"ok":"no")}</span>
        <span class="grow">${esc(m.n)}${m.mock?` <span class="small muted">(استبيان وهمي)</span>`:""}</span><b class="num">${esc(String(m.v))}</b>
        <span class="pill ${m.ok?"pill-ok":"pill-no"}">${m.ok?"محقق":"غير محقق"}</span></li>`).join("")}</ul>`})}

    <div class="grid-even">
      ${card({title:"التقرير التنفيذي", icon:"report", actions:aiTag("مولَّد محلياً"),
        body:`<p class="teaser-h">${esc(sum.headline)}</p><p class="small muted">${esc(sum.summary[1])}</p>
          <div class="rec-mini"><span>التوصية:</span><b>${esc(sum.rec.label)}</b></div>
          <button class="btn btn-primary" type="button" data-act="nav" data-page="report">${ICON.report}فتح التقرير الكامل</button>`})}
      <section class="callout" aria-labelledby="h-limits"><h2 id="h-limits">ما لا تقيسه هذه اللوحة</h2>
        <p class="small">جودة المخرج بعد اعتماده، والتكاليف المالية للتجهيز، وأثر العمل عن بعد على التعاون غير الرسمي. تُستكمل في تقرير نهاية التجربة.</p></section>
    </div>
  </div>`;
}

/* ---------- الموظف: مداي + حاسبة التقدير الذاتي ---------- */
function calcDefaults(e){
  const c = state.config, p = points(e.id);
  return {target: p < c.remoteMin ? c.remoteMin : p + 10, weeks:2, early:50, courses:[]};
}
function calcBounds(e){ const c = state.config, p = points(e.id); return {min:Math.min(p, c.officeMin), max:Math.max(120, p+20)}; }
function calcState(e){
  const d = calcDefaults(e), s = Object.assign({}, d, state.session.calc || {}), b = calcBounds(e);
  s.target = clamp(Number(s.target)||d.target, b.min, b.max);
  s.weeks = clamp(Number(s.weeks)||2, 1, 6);
  s.early = [0,25,50,75,100].includes(Number(s.early)) ? Number(s.early) : 50;
  s.courses = (s.courses||[]).filter(id => courseById(id) && !completionOf(e.id, id));
  return s;
}
function calcResult(e, s){
  const c = state.config, p = points(e.id);
  const pend = state.courses.filter(k => { const x = completionOf(e.id, k.id); return x && x.status==="pending"; });
  const coursePts = (s.courses.length + pend.length) * c.course;
  const perOut = (s.early/100)*(c.onTime + c.earlyBonus) + (1 - s.early/100)*c.onTime;
  const gap = s.target - p, rest = Math.max(0, gap - coursePts);
  const outs = perOut > 0 ? Math.ceil(rest/perOut) : Infinity;
  const perWeek = outs===Infinity ? Infinity : Math.ceil(outs/s.weeks);
  const horizon = isoOffset(s.weeks*7);
  const open = state.tasks.filter(t => t.emp===e.id && taskState(t)==="open" && t.deadline <= horizon).length;
  const overdue = state.tasks.filter(t => t.emp===e.id && taskState(t)==="overdue" && !appealAccepted(t)).length;
  return {p, gap, rest, coursePts, pend, perOut, outs, perWeek, weeklyPts:Math.ceil(Math.max(0,gap)/s.weeks), open, overdue};
}
function calcOutHTML(e, s){
  const R = calcResult(e, s), c = state.config, max = Math.max(s.target, R.p, 1), w = v => clamp(v/max*100, 0, 100);
  let head;
  if (R.gap <= 0) head = `<div class="calc-hero"><span class="calc-big">${ICON.check}</span><div><b>بلغت المستهدف</b><p class="small muted">رصيدك ${R.p} يتجاوز ${s.target}. حافظ عليه بتسليم مخرجاتك في مواعيدها.</p></div></div>`;
  else if (R.rest === 0) head = `<div class="calc-hero"><span class="calc-big num">0</span><div><b>الدورات المختارة تكفي لسد الفجوة</b><p class="small muted">تُضاف ${ptsN(R.coursePts)} بعد توثيق الشهادات.</p></div></div>`;
  else if (R.outs === Infinity) head = `<div class="calc-hero"><div><b>لا يمكن الحساب بقواعد النقاط الحالية</b><p class="small muted">نقاط المخرج المعتمد في الموعد غير موجبة.</p></div></div>`;
  else head = `<div class="calc-hero"><span class="calc-big num">${R.perWeek}</span><div><b>عدد المخرجات المعتمدة المطلوبة أسبوعياً</b><p class="small muted">الإجمالي خلال ${weeksGen(s.weeks)}: <span class="num">${R.outs}</span></p></div></div>`;
  const rows = [
    ["رصيدك الحالي", ptsN(R.p)],
    ["الفجوة حتى المستهدف", ptsN(Math.max(0, R.gap))],
    ["المستهدف الأسبوعي من النقاط", `${ptsN(R.weeklyPts)} أسبوعياً`]
  ];
  if (R.coursePts) rows.push(["من الدورات بعد التوثيق", signed(R.coursePts)]);
  rows.push(["متوسط نقاط المخرج الواحد", `${fmt1(R.perOut)} نقطة`]);
  const courseShare = Math.min(R.coursePts, Math.max(0, R.gap));
  const notes = [];
  if (R.gap > 0 && R.rest > 0 && R.outs !== Infinity){
    notes.push(R.open >= R.outs
      ? `<li class="c-remote">${ICON.check}<span>تكليفاتك المفتوحة ضمن هذه المدة (${R.open}) تكفي إن سلّمتها وفق الخطة.</span></li>`
      : `<li>${ICON.info}<span>تكليفاتك المفتوحة ضمن هذه المدة ${R.open}، وتحتاج ${R.outs - R.open} إضافية. ناقش ذلك مع مديرك.</span></li>`);
  }
  if (R.overdue) notes.push(`<li class="c-office">${ICON.alert}<span>كل مخرج متأخر يخصم ${ptsN(Math.abs(c.late))}، ولديك ${plural(R.overdue, ["مخرج متأخر واحد","مخرجان متأخران","مخرجات متأخرة","مخرجاً متأخراً"])}. الاعتراض المقبول يلغي الخصم.</span></li>`);
  if (R.pend.length) notes.push(`<li>${ICON.clock}<span>احتُسبت ${ptsN(R.pend.length*c.course)} من شهادة بانتظار التوثيق.</span></li>`);
  if (recommend(e)==="prereq") notes.push(`<li>${ICON.list}<span>بلوغ النقاط وحده لا يكفي: أكمل متطلبات البوابة الثانية أولاً.</span></li>`);
  return `${head}
    <div class="calc-rows">${rows.map(r => `<div><span>${r[0]}</span><b class="num">${r[1]}</b></div>`).join("")}</div>
    <div><div class="stackbar" role="img" aria-label="الرصيد الحالي ${R.p}، ومن الدورات ${courseShare}، ومن المخرجات ${R.rest}، للوصول إلى ${s.target}">
      <span class="sb-cur" style="inline-size:${w(R.p)}%"></span><span class="sb-course" style="inline-size:${w(courseShare)}%"></span><span class="sb-out" style="inline-size:${w(R.rest)}%"></span></div>
      <div class="sb-legend" style="margin-top:8px"><span><i class="sw sb-cur"></i>الحالي</span>${R.coursePts?`<span><i class="sw sb-course"></i>الدورات</span>`:""}<span><i class="sw sb-out"></i>المخرجات</span></div></div>
    ${notes.length ? `<ul class="calc-notes">${notes.join("")}</ul>` : ""}`;
}
function calcSay(e, s){
  const R = calcResult(e, s);
  if (R.gap <= 0) return `بلغت المستهدف ${s.target}.`;
  if (R.rest === 0) return "الدورات المختارة تكفي لسد الفجوة.";
  if (R.outs === Infinity) return "لا يمكن الحساب بقواعد النقاط الحالية.";
  return `المطلوب أسبوعياً: ${R.perWeek} من المخرجات المعتمدة، والإجمالي ${R.outs} خلال ${weeksGen(s.weeks)}، لبلوغ ${s.target} نقطة.`;
}
function calcHTML(e){
  const s = calcState(e), c = state.config, p = points(e.id), b = calcBounds(e);
  const avail = state.courses.filter(k => !completionOf(e.id, k.id));
  const fill = (v, lo, hi) => ((v - lo)/((hi - lo)||1)*100).toFixed(1);
  return `<section class="card calc" id="calc" aria-labelledby="h-calc">
    <div class="card-head"><div class="has-ic"><h2 id="h-calc"><span class="ic">${ICON.calc}</span><span>حاسبة التقدير الذاتي</span></h2><p>كم مخرجاً معتمداً تحتاج أسبوعياً لبلوغ مستهدفك؟ تتحدث النتيجة فور تغيير أي مدخل.</p></div></div>
    <div class="calc-grid">
      <div class="calc-in">
        <div class="field"><div class="field-row"><label for="calc-target">الرصيد المستهدف</label><output id="calc-target-o" for="calc-target" class="num">${s.target} نقطة</output></div>
          <input class="range" type="range" id="calc-target" min="${b.min}" max="${b.max}" step="1" value="${s.target}" data-calc style="--fill:${fill(s.target,b.min,b.max)}%" aria-describedby="calc-target-h">
          <div class="range-marks" aria-hidden="true"><span>${b.min}</span><span>${b.max}</span></div>
          <p class="hint" id="calc-target-h">رصيدك الآن ${p}، وحد العمل عن بعد ${c.remoteMin}.</p></div>
        <div class="field"><div class="field-row"><label for="calc-weeks">المدة</label><output id="calc-weeks-o" for="calc-weeks">${plural(s.weeks, W_WEEKS)}</output></div>
          <input class="range" type="range" id="calc-weeks" min="1" max="6" step="1" value="${s.weeks}" data-calc style="--fill:${fill(s.weeks,1,6)}%">
          <div class="range-marks" aria-hidden="true"><span>أسبوع</span><span>6 أسابيع</span></div></div>
        <fieldset class="fs"><legend>نسبة المخرجات التي تخطط لتسليمها مبكراً</legend>
          <div class="seg">${[0,25,50,75,100].map(v => `<label><input type="radio" name="calc-early" value="${v}" data-calc ${s.early===v?"checked":""}><span class="num">${v}%</span></label>`).join("")}</div>
          <p class="hint">المبكر: قبل الموعد ${byDays(c.earlyDays)} أو أكثر، ويمنح ${signed(c.onTime+c.earlyBonus)} بدلاً من ${signed(c.onTime)}.</p></fieldset>
        ${avail.length ? `<fieldset class="fs"><legend>دورات تخطط لإتمامها (${signed(c.course)} لكل دورة بعد التوثيق)</legend><div class="chk-list">${avail.map(k => `<label class="check"><input type="checkbox" name="calc-course" value="${k.id}" data-calc ${s.courses.includes(k.id)?"checked":""}><span>${esc(k.title)}${k.required?` <span class="pill pill-ok">شرط</span>`:""}</span></label>`).join("")}</div></fieldset>` : ""}
      </div>
      <div class="calc-out" id="calc-out">${calcOutHTML(e, s)}</div>
    </div>
    <p class="sr-only" id="calc-say" aria-live="polite"></p>
  </section>`;
}
function pageMyHome(){
  const e = self(), g = gates(e), r = recommend(e), c = state.config, rc = REQUIRED();
  const actionFor = i => {
    if (i.ok) return "";
    if (i.key==="charter") return `<button class="btn btn-sm btn-primary" type="button" data-act="sign-charter">قراءة الميثاق وتوقيعه</button>`;
    if (i.key==="home") return `<button class="btn btn-sm btn-primary" type="button" data-act="declare-home">إقرار الجاهزية</button>`;
    if (i.key==="security"){
      const comp = completionOf(e.id, rc);
      return comp && comp.status==="pending" ? `<span class="pill pill-review">بانتظار توثيق الشهادة</span>`
        : `<button class="btn btn-sm btn-ghost" type="button" data-act="nav" data-page="kafaa">الذهاب إلى الدورة</button>`;
    }
    return `<span class="small muted">تُستوفى تلقائياً بانتهاء الفترة</span>`;
  };
  const recall = recallActive(e) ? `<div class="banner red" role="status">${ICON.alert}<div><b>استدعاء حضوري مؤقت حتى ${fmtDateY(e.recall.until)}</b>
    <p class="small">${esc(e.recall.reason)}: ${esc(e.recall.note)}. يعود قرارك المعتمد تلقائياً بانتهاء المدة.</p></div></div>` : "";
  const mine = state.tasks.filter(t => t.emp===e.id), cnt = s => mine.filter(t => taskState(t)===s).length;
  return pageHead("مداي", `${esc(e.name)}، ${esc(roleOf(e).title)} في ${esc(e.dept)}`) + recall + `
  <div class="grid-2">
    <div class="stack">
      ${card({title:"وضعي الحالي", icon:"gauge", actions:badge(r), body:`${gauge(e,true)}
        <div class="gauge-legend"><span>الخط الأول: الحد الأدنى ${c.officeMin}</span><span>الخط الثاني: حد العمل عن بعد ${c.remoteMin}</span></div>
        <p class="reason" style="margin-top:12px">${esc(recReason(e))}</p>
        <div class="decision" style="margin-top:12px"><span>القرار المعتمد: <b>${decisionText(e)}</b></span><span class="small muted">منذ ${fmtDate(e.decision.date)}</span></div>`})}
      ${calcHTML(e)}
      ${card({title:"بوابات الأهلية", icon:"list", sub:"تُقيَّم بالترتيب، ولا يُنظر في الأداء قبل اكتمال المتطلبات", body:`${gatesHTML(e)}
        <h3 class="sub-h">متطلبات البوابة الثانية</h3>
        <ul class="checklist">${g.items.map(i => `<li><span class="st ${i.ok?"ok":"no"}">${stIcon(i.ok?"ok":"no")}</span>
          <span class="grow">${esc(i.label)}<span class="sr-only">، ${i.ok?"مستوفى":"غير مستوفى"}</span></span>${actionFor(i)}</li>`).join("")}</ul>`})}
    </div>
    <div class="stack">
      <section class="card next-step" aria-labelledby="h-next"><h2 id="h-next">${ICON.sparkles}الخطوة التالية</h2><p>${nextStep(e)}</p></section>
      ${card({title:"أدائي مقارنة بخط أساسي", icon:"target", body:`
        <p>الالتزام بالمواعيد خلال التجربة: <b class="num">${pctTxt(pilotRateOf(e.id))}</b></p>
        <p class="small muted">خط أساسك قبل التجربة: <span class="num">${pctTxt(baselineOf(e.id))}</span>. المقارنة مع أدائك السابق، لا مع زملائك.</p>
        <p class="small" style="margin-top:8px">${cnt("early")+cnt("ontime")+cnt("lateDone")} مخرجات معتمدة، و${cnt("open")} قيد التنفيذ، و${cnt("overdue")} متأخرة.</p>
        <div style="margin-top:10px">${ledgerHTML(e)}</div>`})}
      ${velocityHTML([e], true)}
      ${card({title:"لوحة التقدير", icon:"award", body:`<label class="check"><input type="checkbox" data-act="consent" ${e.consent?"checked":""}>
          <span>أوافق على ظهور اسمي في لوحة التقدير عند تحسّن أدائي. يمكنني سحب الموافقة في أي وقت.</span></label>`})}
    </div>
  </div>`;
}
function nextStep(e){
  const g = gates(e), c = state.config, r = recommend(e);
  if (recallActive(e)) return `أنت في استدعاء حضوري مؤقت حتى ${fmtDate(e.recall.until)}. ركّز على تسليم المخرجات المتأخرة في مواعيدها الجديدة.`;
  if (!g.g1.ok) return "وظيفتك مصنفة حضورية بطبيعتها. البديل المتاح لك هو الساعات المرنة وفق سياسة المؤسسة.";
  const miss = g.items.find(i => !i.ok);
  if (miss){
    const map = {probation:"تُستوفى بعد انتهاء فترة التجربة الوظيفية.", charter:"اقرأ ميثاق العمل عن بعد ووقّعه.",
      home:"أكّد جاهزية مكان عملك في المنزل.", security:"اجتز دورة أمن المعلومات من منصة كفاءة، ثم ينتظر تسجيلك توثيق المدير."};
    return "أكمل المتطلبات أولاً: " + map[miss.key];
  }
  if (g.p < c.remoteMin) return `تحتاج ${ptsN(c.remoteMin-g.p)} لبلوغ حد العمل عن بعد. استخدم الحاسبة لتخطيط عدد المخرجات أسبوعياً.`;
  if (isPending(e)) return "استوفيت البوابات الثلاث. التوصية بانتظار اعتماد مديرك المباشر.";
  if (r==="remote" && e.decision.mode==="remote") return `أنت معتمد للعمل ${decisionText(e)}. حافظ على تسليم المخرجات في موعدها وعلى التواجد من ${c.coreStart} إلى ${c.coreEnd}.`;
  return "لا إجراء مطلوب منك الآن.";
}

/* ---------- المدير/الموارد البشرية: لوحة القيادة ---------- */
function actionPreviewHTML(){
  const items = actionItems(), top = items.slice(0, 4);
  const body = top.length ? `<ul class="preview">${top.map(it => `<li><span class="ic ${KIND[it.kind].cls}">${ICON[KIND[it.kind].icon]}</span>
      <div class="pv-main"><b>${esc(it.e.name)}</b><span class="small muted">${KIND[it.kind].label}${it.age!=null ? "، "+ageTxt(it.age) : ""}</span></div>
      ${it.prio>=2 ? prioPill(it.prio) : ""}
      <button class="btn btn-sm btn-ghost" type="button" data-act="dock" data-tab="${KIND[it.kind].tab}" aria-label="معالجة ${KIND[it.kind].label}: ${esc(it.e.name)}">معالجة</button></li>`).join("")}</ul>`
    : `<p class="empty">${ICON.check}لا توجد إجراءات معلقة.</p>`;
  return card({title:"أولويات اليوم", icon:"inbox", sub:`${plural(items.length, W_ACT)} بانتظارك، مرتبة حسب الأولوية`,
    body: body + (items.length > top.length ? `<button class="btn btn-quiet btn-sm" type="button" data-act="dock" data-tab="all" style="margin-top:6px">عرض الكل في مركز الإجراءات (${items.length})</button>` : "")});
}
function recognitionHTML(){
  const rows = state.employees.filter(e => e.consent).map(e => ({e, b:baselineOf(e.id), r:pilotRateOf(e.id)}))
    .filter(x => x.r!=null && x.b!=null).map(x => ({...x, d:Math.round((x.r-x.b)*100)}))
    .filter(x => x.d>0).sort((a,b) => b.d-a.d).slice(0,5);
  const shown = state.employees.filter(e => e.consent).length;
  return card({title:"لوحة التقدير", icon:"award", ic:"remote", sub:"الأكثر تحسناً مقارنة بخط أساسهم",
    body:`${rows.length ? `<ol class="board">${rows.map(x => `<li><span>${esc(x.e.name)}<small>${esc(x.e.dept)}</small></span><b class="num c-remote">${ptsTxt(x.d)}</b></li>`).join("")}</ol>`
      : `<p class="empty">لا يوجد تحسن مسجل بعد لدى الموافقين على الظهور.</p>`}
    <p class="small muted" style="margin-top:10px">يظهر فقط من وافق على الظهور (${shown} من ${state.employees.length}). لا تُعرض أي حالة سلبية هنا.</p>`});
}
function pageHome(){
  const pi = pilotInfo(), c = state.config, st = execStats(), n0 = inboxCount();
  const recs = state.employees.map(recommend), n = k => recs.filter(x => x===k).length;
  const late = state.tasks.filter(t => taskState(t)==="overdue" && !appealAccepted(t)).length;
  const tile = (v, label, cls, icon) => `<div class="tile"><span class="ic ${cls}">${ICON[icon]}</span><b class="num">${v}</b><span>${label}</span></div>`;
  return pageHead("لوحة القيادة", "ما يحتاج إلى قرارك اليوم: إنذارات، وتنبؤات، واعتمادات، واعتراضات. كل إجراء يُوثَّق في سجل التدقيق.",
      {actions:`<button class="btn btn-primary" type="button" data-act="nav" data-page="actions">${ICON.inbox}مركز الإجراءات${n0?` <span class="count num">${n0}</span>`:""}</button>`}) + `
  <div class="hero-row">
    <section class="card pilot-card" aria-labelledby="h-pilot">
      <h2 id="h-pilot">تجربة العمل عن بعد: الأسبوع <span class="num">${pi.week}</span> من <span class="num">${c.pilotWeeks}</span></h2>
      <div class="hz-mini" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pi.pct)}" aria-label="نسبة مضي التجربة"><span style="inline-size:${pi.pct}%"></span><i style="inset-inline-start:${pi.pct}%"></i></div>
      <p class="small muted" style="margin-top:10px">الالتزام بالمواعيد <span class="num">${pctTxt(st.rP)}</span> مقابل خط أساس <span class="num">${pctTxt(st.rB)}</span> ${trendChip(st.delta)}</p>
      <p class="small muted">تنتهي في ${fmtDateY(pi.end)}.</p>
    </section>
    <div class="tiles">
      ${tile(n("remote"), "مؤهلون للعمل عن بعد", "remote", "home")}
      ${tile(n("review"), "قيد المراجعة", "review", "clock")}
      ${tile(n("prereq"), "متطلبات غير مكتملة", "prereq", "list")}
      ${tile(n("office"), "ملزمون بالحضور", "office", "building")}
      ${tile(n("onsiteRole"), "وظائف حضورية", "neutral", "building")}
      ${tile(late, "مخرجات متأخرة", "office", "alert")}
    </div>
  </div>
  <div class="grid-2" style="margin-top:20px">
    <div class="stack">${riskRadarHTML(false)}</div>
    <div class="stack">${actionPreviewHTML()}${recognitionHTML()}
      <section class="callout" aria-labelledby="h-gov"><h2 id="h-gov">مبدأ الحوكمة</h2>
      <p class="small">النظام يوصي، والمدير يعتمد، وكل قرار موثق. لا يتغير نمط عمل أي موظف دون اعتماد، ولا تُخالَف أي توصية دون سبب مكتوب، ولا يُستدعى أي موظف دون سبب ومدة محددة.</p></section>
    </div>
  </div>`;
}

/* ---------- مركز إجراءات المدير ---------- */
function appealInsightHTML(t){
  const a = assessAppeal(t), col = a.verdict==="accept" ? "remote" : a.verdict==="verify" ? "review" : "office";
  const pill = a.verdict==="accept" ? "pill-ok" : a.verdict==="verify" ? "pill-review" : "pill-no";
  return `<div class="insight"><div class="insight-h">${ICON.sparkles}<span>المساعد التحليلي:</span><span class="pill ${pill}">${a.label}</span><span class="small muted">${a.confidence}</span>${aiTag("كيف يعمل؟")}</div>
    <div class="meter" role="img" aria-label="قوة المبرر ${a.score} من 100"><span class="m-${col}" style="inline-size:${a.score}%"></span></div>
    <p class="small">قوة المبرر: <b class="num">${a.score}</b> من 100</p>
    <details style="margin-top:6px"><summary>العوامل التي بُني عليها الاقتراح (${a.factors.length})</summary>${factorList(a.factors, "appeal")}</details>
    <p class="small" style="margin-top:8px"><b>الخطوة المقترحة:</b> ${esc(a.next)}</p></div>`;
}
function actionItemHTML(it){
  const K = KIND[it.kind], e = it.e, hid = "ai-" + it.key;
  let desc = "", extra = "", acts = "";
  if (it.kind==="approval"){
    const to = targetDecision(e);
    desc = `التوصية: من ${modeWord(e.decision.mode)} إلى ${decisionText(e,to)}. ${esc(recReason(e))}`;
    extra = `<div style="margin-top:8px">${badge(recommend(e))}</div>`;
    acts = `<button class="btn btn-sm btn-primary" type="button" data-act="approve" data-id="${e.id}">${ICON.check}اعتماد التوصية</button>
      <button class="btn btn-sm btn-ghost" type="button" data-act="hold" data-id="${e.id}">إبقاء القرار المعتمد</button>`;
  } else if (it.kind==="appeal"){
    const t = it.t;
    desc = `<b>${esc(t.title)}</b>: موعده ${fmtDate(t.deadline)}، والإنجاز ${t.progress}%.<br>السبب: ${esc(t.appeal.reason)}. «${esc(t.appeal.note)}»`;
    extra = appealInsightHTML(t);
    acts = `<button class="btn btn-sm btn-primary" type="button" data-act="appeal-accept" data-id="${t.id}">قبول واستبعاد الخصم</button>
      <button class="btn btn-sm btn-ghost" type="button" data-act="appeal-reject" data-id="${t.id}">رفض بسبب مكتوب</button>`;
  } else if (it.kind==="warning"){
    desc = `<ul class="reasons">${it.w.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`;
    extra = `<div style="margin-top:8px"><span class="lvl ${it.w.level}">${ICON.alert}${it.w.level==="high"?"خطر مرتفع":"خطر متوسط"}</span></div>`;
    acts = `${e.decision.mode==="remote" && !recallActive(e) ? `<button class="btn btn-sm btn-danger" type="button" data-act="recall" data-id="${e.id}">استدعاء حضوري مؤقت</button>` : ""}
      <button class="btn btn-sm btn-ghost" type="button" data-act="followup" data-id="${e.id}">تسجيل متابعة</button>`;
  } else if (it.kind==="prediction"){
    const p = it.p;
    desc = p.t ? `<b>${esc(p.t.title)}</b>: يحل موعده ${fmtDate(p.t.deadline)}، والإنجاز الحالي ${p.t.progress}%. لم يتأخر بعد.` : "اتجاه سرعة التسليم يقترب من تجاوز المواعيد، دون تأخر فعلي حتى الآن.";
    extra = `<div class="insight"><div class="insight-h">${ICON.sparkles}<span>لماذا يتوقع المحرك خطراً؟</span>${riskBadge(p)}</div>${factorList(p.factors, "risk")}</div>`;
    acts = `<button class="btn btn-sm btn-primary" type="button" data-act="preventive" data-id="${e.id}"${p.t?` data-task="${p.t.id}"`:""}>${ICON.bolt}توثيق إجراء استباقي</button>`;
  } else if (it.kind==="verify"){
    const req = it.x.course===REQUIRED();
    desc = `${esc(courseById(it.x.course).title)}: سُجّلت ${ageTxt(it.age)}. لا تُحتسب النقاط قبل التحقق من الشهادة.${req ? " هذه الشهادة شرط في البوابة الثانية." : ""}`;
    acts = `<button class="btn btn-sm btn-primary" type="button" data-act="verify" data-emp="${it.x.emp}" data-course="${it.x.course}">توثيق</button>
      <button class="btn btn-sm btn-ghost" type="button" data-act="verify-reject" data-emp="${it.x.emp}" data-course="${it.x.course}">رفض</button>`;
  }
  return `<article class="a-item prio-${it.prio}" aria-labelledby="${hid}">
    <span class="ic ${K.cls}">${ICON[K.icon]}</span>
    <div><div class="a-meta"><h2 id="${hid}" class="a-title">${esc(e.name)}</h2><span class="kind-tag">${K.label}</span>${prioPill(it.prio)}${it.age!=null ? `<span class="small muted">${ageTxt(it.age)}</span>` : ""}</div>
      <div class="a-desc">${desc}</div>${extra}<div class="a-actions">${acts}</div></div></article>`;
}
function pageActions(){
  const items = actionItems(), tab = state.session.tab, acc = accountability();
  const inTab = k => k==="all" ? items : items.filter(it => KIND[it.kind].tab===k);
  const list = inTab(tab);
  const urgent = items.filter(i => i.prio >= 3).length, oldest = items.reduce((m,i) => Math.max(m, i.age||0), 0);
  const pend = state.employees.filter(isPending);
  const bulk = (tab==="approvals" || tab==="all") && pend.length > 1 ? `<button class="btn btn-ghost" type="button" data-act="approve-all">${ICON.check}اعتماد كل التوصيات (${pend.length})</button>` : "";
  const stat = (v, l, cls, icon) => `<div class="tile"><span class="ic ${cls}">${ICON[icon]}</span><b class="num">${v}</b><span>${l}</span></div>`;
  return pageHead("مركز الإجراءات", "كل ما ينتظر قرارك في مكان واحد، مرتب حسب الأولوية. الاقتراحات التحليلية استرشادية، وكل قرار يُوثَّق في سجل التدقيق.", {actions:bulk}) + `
  <div class="stat-strip">
    ${stat(items.length, "بانتظار الإجراء", "", "inbox")}
    ${stat(urgent, "عاجلة", "office", "alert")}
    ${stat(oldest ? plural(oldest, W_DAYS) : "اليوم", "عمر أقدم بند معلق", "review", "clock")}
    ${stat(acc.total ? `${acc.handled}/${acc.total}` : "—", "معدل المحاسبية", "remote", "shield")}
  </div>
  <div class="tabs" role="tablist" aria-label="تصنيف الإجراءات" data-rove="tabs">${TABS.map(([k,l]) =>
    `<button type="button" role="tab" class="tab" id="tab-${k}" data-act="tab" data-tab="${k}" data-rove-item aria-selected="${tab===k}" aria-controls="tabpanel" tabindex="${tab===k?0:-1}">${l}<span class="count num">${inTab(k).length}</span></button>`).join("")}</div>
  <div id="tabpanel" role="tabpanel" aria-labelledby="tab-${tab}" class="a-list">${list.length ? list.map(actionItemHTML).join("")
    : `<div class="card"><p class="empty">${ICON.check}لا توجد بنود في هذا التصنيف. اختر تصنيفاً آخر أو عد إلى لوحة القيادة.</p></div>`}</div>`;
}

/* ---------- الفريق والمحاسبية ---------- */
function memberCard(e){
  const r = recommend(e), pend = isPending(e), eff = effectiveMode(e), w = warning(e), pr = predictedRisks().find(p => p.e.id===e.id);
  const effPill = eff.why==="continuity" ? `<span class="pill pill-review">عن بعد مؤقتاً: استمرارية الأعمال</span>`
    : eff.why==="recall" ? `<span class="pill pill-no">استدعاء حضوري حتى ${fmtDate(e.recall.until)}</span>` : "";
  const hid = "m-" + e.id;
  return `<article class="card member" aria-labelledby="${hid}">
    <div class="member-head"><div class="who-blk"><span class="avatar" aria-hidden="true">${initials(e.name)}</span><div><h2 class="m-name" id="${hid}">${esc(e.name)}</h2><p class="small muted">${esc(roleOf(e).title)}، ${esc(e.dept)}</p></div></div>
      <div class="chips-row">${w?`<span class="lvl ${w.level}">${ICON.alert}إنذار مبكر</span>`:""}${pr?riskBadge(pr):""}${badge(r)}</div></div>
    ${gatesHTML(e,true)}
    ${gauge(e,false)}
    <p class="reason">${esc(recReason(e))} الالتزام خلال التجربة ${pctTxt(pilotRateOf(e.id))} مقابل خط أساس ${pctTxt(baselineOf(e.id))}.</p>
    <div class="decision"><span>القرار المعتمد: <b>${decisionText(e)}</b> <span class="muted small">(${esc(e.decision.by)}، ${fmtDate(e.decision.date)})</span> ${effPill}</span>
      <span class="actions">
      ${recallActive(e) && can("intervene") ? `<button class="btn btn-sm btn-ghost" type="button" data-act="end-recall" data-id="${e.id}">إنهاء الاستدعاء</button>` : ""}
      ${pend ? `<button class="btn btn-sm btn-primary" type="button" data-act="approve" data-id="${e.id}">اعتماد التوصية</button>
        <button class="btn btn-sm btn-ghost" type="button" data-act="hold" data-id="${e.id}">إبقاء القرار</button>`
        : e.decision.heldFor && e.decision.heldFor===r+":"+targetDecision(e) ? `<span class="pill pill-info">أُبقي القرار بسبب مكتوب</span>` : `<span class="pill pill-ok">${ICON.check}متوافق مع التوصية</span>`}
      </span></div>
    ${(e.interventions||[]).length ? `<details><summary>التدخلات الإدارية (${e.interventions.length})</summary><ul class="ledger">${e.interventions.map(i => `<li><span>${INTERVENTION_LABEL[i.type]||"تدخل"}: ${esc(i.note)}</span><span class="small muted">${fmtDate(i.date)}</span></li>`).join("")}</ul></details>` : ""}
    ${ledgerHTML(e)}
  </article>`;
}
function pageTeam(){
  const list = [...state.employees].sort((a,b) => (!!warning(b) - !!warning(a)) || (isPending(b)-isPending(a)) || (points(b.id)-points(a.id)));
  return pageHead("الفريق والمحاسبية", "لكل موظف: بوابات الأهلية، والرصيد، والتوصية، والقرار المعتمد، وأي تدخل إداري. التوصية لا تُنفَّذ إلا باعتماد.")
    + `<div class="team-grid">${list.map(memberCard).join("")}</div>`;
}

/* ---------- المخرجات والمهام ---------- */
function pageTasks(){
  const emp = role()==="employee", c = state.config;
  const fs = state.session.fStatus, fe = emp ? SELF_ID : state.session.fEmp;
  const FILTER = {all:"كل الحالات", open:"قيد التنفيذ", overdue:"متأخرة لم تُسلَّم", approved:"مخرجات معتمدة", early:"معتمدة قبل الموعد"};
  const match = t => { const s = taskState(t); return fs==="all" || (fs==="approved" ? ["early","ontime","lateDone"].includes(s) : s===fs); };
  const list = state.tasks.filter(t => (fe==="all" || t.emp===fe) && match(t)).sort((a,b) => a.deadline.localeCompare(b.deadline));
  const empOpts = state.employees.map(e => `<option value="${e.id}" ${fe===e.id?"selected":""}>${esc(e.name)}</option>`).join("");

  const addForm = can("tasks") ? card({title:"تكليف بمخرج جديد", icon:"flag", sub:"كل تكليف يرتبط بمخرج قابل للقياس وموعد محدد", body:`
    <form class="add-task" id="add-task" novalidate>
      <div class="field"><label for="n-emp">الموظف</label><select class="input" id="n-emp">${state.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="n-title">وصف التكليف</label><input class="input" id="n-title" maxlength="120" autocomplete="off"></div>
      <div class="field"><label for="n-kpi">المخرج المتوقع (مؤشر الأداء)</label><input class="input" id="n-kpi" maxlength="120" autocomplete="off"></div>
      <div class="field"><label for="n-date">الموعد النهائي</label><input class="input num" type="date" id="n-date" value="${isoOffset(7)}"></div>
      <button class="btn btn-primary" type="submit">إصدار التكليف</button>
    </form><p class="error" id="task-error" role="alert"></p>`}) : "";

  const rows = list.map(t => {
    const s = taskState(t), imp = taskImpact(t), done = t.status==="done", prog = done ? 100 : t.progress;
    let statusCell;
    if (can("tasks")) statusCell = `<select class="input input-sm" data-act="status" data-id="${t.id}" aria-label="حالة التكليف: ${esc(t.title)}">
        ${[["progress","قيد التنفيذ"],["done","اعتماد المخرج"],["late","متأخر — لم يُسلَّم"]].map(([v,l]) => `<option value="${v}" ${t.status===v?"selected":""}>${l}</option>`).join("")}</select>
        ${done ? `<span class="sub">${STATE_LABEL[s]}، ${fmtDate(t.completedAt)}</span>` : ""}`;
    else statusCell = `<span class="pill ${STATE_PILL[s]}">${STATE_LABEL[s]}</span>${done?`<span class="sub">اعتُمد في ${fmtDate(t.completedAt)}</span>`:""}`;
    if (isAutoLate(t)) statusCell += `<span class="note-late">متأخر تلقائياً: تجاوز الموعد</span>`;
    if (s==="open"){ const rk = taskRisk(t); if (rk && rk.score >= c.predictThreshold) statusCell += `<div style="margin-top:8px">${riskBadge({...rk, t, e:empById(t.emp)})}</div>`; }

    const pcls = done ? "p-done" : s==="overdue" ? "p-late" : "p-open";
    let progCell = `<div class="prog"><div class="prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog}" aria-label="نسبة إنجاز ${esc(t.title)}"><span class="${pcls}" style="inline-size:${prog}%"></span></div><b class="num">${prog}%</b></div>`;
    if (emp && t.status==="progress") progCell += `<select class="input input-sm" style="margin-top:6px" data-act="progress" data-id="${t.id}" aria-label="تحديث نسبة الإنجاز: ${esc(t.title)}">
        ${[0,10,20,30,40,50,60,70,80,90].map(v => `<option value="${v}" ${t.progress===v?"selected":""}>${v}%</option>`).join("")}</select>`;

    let appealCell = "";
    if (t.appeal){
      const ap = {pending:["pill-review","اعتراض قيد الدراسة"],accepted:["pill-ok","قُبل الاعتراض"],rejected:["pill-no","رُفض الاعتراض"]}[t.appeal.status];
      appealCell = `<span class="pill ${ap[0]}" style="margin-top:6px">${ap[1]}</span>`;
      if (t.appeal.status==="rejected" && t.appeal.rejectNote) appealCell += `<span class="sub">${esc(t.appeal.rejectNote)}</span>`;
      if (t.appeal.status==="pending" && can("appeals")) appealCell += `<span class="actions" style="margin-top:6px">
        <button class="btn btn-sm btn-ghost" type="button" data-act="dock" data-tab="appeals">مراجعة في مركز الإجراءات</button></span>`;
    } else if (emp && s==="overdue") {
      appealCell = `<button class="btn btn-sm btn-ghost" style="margin-top:6px" type="button" data-act="appeal-new" data-id="${t.id}">الاعتراض على الخصم</button>`;
    }
    return `<tr>
      ${emp ? "" : `<td data-label="الموظف">${esc(empById(t.emp).name)}</td>`}
      <td data-label="التكليف">${esc(t.title)}<span class="sub">${esc(t.kpi)}</span></td>
      <td data-label="الموعد" class="num">${fmtDate(t.deadline)}</td>
      <td data-label="الحالة">${statusCell}</td>
      <td data-label="الإنجاز">${progCell}</td>
      <td data-label="النقاط">${deltaChip(imp)}<div>${appealCell}</div></td>
    </tr>`;
  }).join("");

  const velList = emp ? [self()] : state.employees.filter(e => fe==="all" || e.id===fe);
  const total = state.tasks.filter(t => emp ? t.emp===SELF_ID : true).length;
  return pageHead(emp ? "مهامي" : "المخرجات والمهام",
      emp ? `حدّث نسبة إنجاز تكليفاتك الجارية. المخرج المعتمد قبل موعده ${byDays(c.earlyDays)} أو أكثر يمنحك ${signed(c.onTime+c.earlyBonus)}. إن تأخر تكليف لسبب خارج عن إرادتك، اعترض على الخصم مع ذكر السبب.`
          : `سلّم النقاط: ${signed(c.onTime+c.earlyBonus)} للمخرج المعتمد قبل موعده ${byDays(c.earlyDays)} أو أكثر، و${signed(c.onTime)} في الموعد، و${signed(c.lateDelivered)} بعده، و${signed(c.late)} لعدم التسليم.`)
    + `<div class="stack">${addForm}
    ${velocityHTML(velList, emp)}
    ${card({title:emp?"قائمة تكليفاتي":"سجل التكليفات", icon:"tasks", actions:`<span class="small muted num">${list.length} من ${total}</span>`, body:`
      <div class="filters">
        <div class="field"><label for="f-status">الحالة</label><select class="input" id="f-status" data-act="filter" data-key="fStatus">
          ${Object.entries(FILTER).map(([v,l]) => `<option value="${v}" ${fs===v?"selected":""}>${l}</option>`).join("")}</select></div>
        ${emp ? "" : `<div class="field"><label for="f-emp">الموظف</label><select class="input" id="f-emp" data-act="filter" data-key="fEmp"><option value="all">كل الموظفين</option>${empOpts}</select></div>`}
      </div>
      <div class="table-wrap"><table>
        <thead><tr>${emp?"":"<th scope='col'>الموظف</th>"}<th scope="col">التكليف والمخرج المتوقع</th><th scope="col">الموعد</th><th scope="col">الحالة</th><th scope="col">الإنجاز</th><th scope="col">النقاط</th></tr></thead>
        <tbody>${rows || `<tr><td class="full empty" colspan="6">لا توجد تكليفات بهذه الحالة. غيّر عامل التصفية${can("tasks")?" أو أصدر تكليفاً جديداً":""}.</td></tr>`}</tbody>
      </table></div>`})}
    </div>`;
}

/* ---------- منصة كفاءة ---------- */
function pageKafaa(){
  const emp = role()==="employee", c = state.config;
  const cards = state.courses.map(k => {
    const verified = state.completions.filter(x => x.course===k.id && x.status==="verified");
    const pending = state.completions.filter(x => x.course===k.id && x.status==="pending");
    let foot;
    if (emp){
      const mine = completionOf(SELF_ID, k.id);
      foot = mine ? (mine.status==="verified" ? `<span class="pill pill-ok">${ICON.check}موثقة: ${signed(c.course)} نقاط</span>` : `<span class="pill pill-review">بانتظار توثيق الشهادة</span>`)
        : `<button class="btn btn-primary" type="button" data-act="course-self" data-id="${k.id}">تسجيل اجتيازي للدورة</button>`;
    } else {
      const remaining = state.employees.filter(e => !completionOf(e.id,k.id));
      foot = `${pending.length ? `<p class="small"><span class="pill pill-review">${pending.length} بانتظار التوثيق</span> في مركز الإجراءات</p>` : ""}
        ${remaining.length ? `<div class="inline-form"><div class="field"><label for="reg-${k.id}">تسجيل شهادة موثقة</label>
          <select class="input" id="reg-${k.id}">${remaining.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>
          <button class="btn btn-ghost" type="button" data-act="course-register" data-id="${k.id}">تسجيل</button></div>` : `<p class="small muted">اجتازها جميع الموظفين.</p>`}`;
    }
    const hid = "k-" + k.id;
    return `<article class="card course" aria-labelledby="${hid}">
      <div class="c-top"><span class="ic ${k.required?"remote":""}">${ICON.cap}</span>${k.required ? `<span class="pill pill-ok">شرط للعمل عن بعد</span>` : ""}</div>
      <h2 id="${hid}">${esc(k.title)}</h2>
      <p class="small muted num">${k.hours} ساعات${emp?"":`، موثقة لدى ${verified.length} من ${state.employees.length}`}</p>
      <p>${esc(k.desc)}</p>
      ${!emp && verified.length ? `<div class="chips">${verified.map(x => `<span class="chip">${esc(empById(x.emp).name)}</span>`).join("")}</div>` : ""}
      <div class="course-foot">${foot}</div></article>`;
  }).join("");
  return pageHead("منصة كفاءة", `دورات قصيرة لمهارات العمل عن بعد. كل دورة تضيف ${signed(c.course)} نقاط مرة واحدة بعد توثيق الشهادة. دورة أمن المعلومات شرط من شروط البوابة الثانية.`)
    + `<div class="courses">${cards}</div>`;
}

/* ---------- معايير النجاح ---------- */
function pagePilot(){
  const pi = pilotInfo(), M = successCriteria(), met = M.filter(m => m.ok).length, k = state.continuity;
  return pageHead("معايير النجاح", `الأسبوع ${pi.week} من ${state.config.pilotWeeks}. المعايير اعتُمدت قبل بدء التجربة، ويُتخذ قرار التوسيع أو التعديل أو الإيقاف في نهايتها بناءً عليها.`) + `
  <div class="stack">
    ${card({title:"المعايير والقياس الحالي", icon:"target", actions:`<span class="pill ${met===M.length?"pill-ok":"pill-review"} num">${met} من ${M.length} محققة</span>`, body:`
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">المؤشر وصيغته</th><th scope="col">خط الأساس</th><th scope="col">الحالي</th><th scope="col">الهدف</th><th scope="col">الحالة</th></tr></thead>
        <tbody>${M.map(m => `<tr>
          <td data-label="المؤشر">${esc(m.n)}${m.mock?`<span class="sub">استبيان، بيانات وهمية</span>`:""}</td>
          <td data-label="خط الأساس" class="num">${m.b}</td><td data-label="الحالي" class="num"><b>${esc(String(m.v))}</b></td>
          <td data-label="الهدف">${m.t}</td>
          <td data-label="الحالة"><span class="pill ${m.ok?"pill-ok":"pill-no"}">${m.ok?"محقق":"غير محقق"}</span></td></tr>`).join("")}</tbody>
      </table></div>`})}
    ${card({title:"وضع استمرارية الأعمال", icon:"shield", sub:"للأنواء المناخية والأزمات الصحية وأعطال المقر", body:`
      <p class="small">عند التفعيل تعمل الوظائف القابلة للعمل عن بعد من المنزل مؤقتاً، وتُعلَّق الاستدعاءات الحضورية، دون تغيير القرارات المعتمدة أو النقاط.</p>
      <div class="decision" style="margin-top:12px"><span>${k.active ? `<b>مفعّل</b>: ${esc(k.reason)}${k.until?` حتى ${fmtDateY(k.until)}`:""} <span class="small muted">(${esc(k.by)})</span>` : "<b>غير مفعّل</b>"}</span>
        ${can("continuity") ? (k.active ? `<button class="btn btn-sm btn-ghost" type="button" data-act="cont-off">إنهاء الوضع</button>` : `<button class="btn btn-sm btn-primary" type="button" data-act="cont-on">تفعيل الوضع</button>`)
          : `<span class="small muted">التفعيل من صلاحية الموارد البشرية</span>`}</div>`})}
  </div>`;
}

/* ---------- القواعد والميثاق ---------- */
function charterItems(){
  const c = state.config;
  return [
    `التواجد في الساعات الأساسية من ${c.coreStart} إلى ${c.coreEnd}، والرد على التواصل خلال ${c.responseMins} دقيقة.`,
    "تُقاس الإنتاجية بالمخرجات المعتمدة، وبالمؤشرات نفسها في أيام المقر والمنزل.",
    "استخدام الأجهزة المؤسسية فقط، والاتصال عبر الشبكة الافتراضية الخاصة مع التحقق الثنائي.",
    "عدم حفظ البيانات الحساسة على الأجهزة الشخصية، وحماية الشاشة من اطلاع الآخرين.",
    "يحق للمؤسسة استدعاء الموظف للحضور مؤقتاً بسبب مكتوب ومدة محددة، وإعادته إلى الدوام الحضوري عند الإخلال الجسيم أو تهديد أمن المعلومات.",
    "تُحترم خصوصية الموظف، ولا تُستخدم بياناته لغير أغراض العمل."
  ];
}
const CONFIG_GROUPS = [
  ["النقاط",[["base","الرصيد الافتتاحي"],["onTime","مخرج معتمد في الموعد"],["earlyBonus","مكافأة الإنجاز المبكر"],["earlyDays","أيام التبكير المطلوبة"],["lateDelivered","مخرج معتمد بعد الموعد"],["late","تأخر دون تسليم"],["course","شهادة موثقة"]]],
  ["الأهلية",[["remoteMin","حد العمل عن بعد"],["officeMin","الحد الأدنى"],["daysFull","أيام الوظائف القابلة كلياً"],["daysPartial","أيام الوظائف القابلة جزئياً"]]],
  ["الإنذار المبكر والتنبؤ",[["warnLate","عدد التأخرات المسببة للإنذار"],["warnWindow","نافذة الرصد (أيام)"],["warnDrop","الانخفاض عن خط الأساس (نقطة مئوية)"],["predictThreshold","حد التنبيه التنبؤي (من 100)"],["predictHorizon","أفق التنبؤ (أيام)"]]],
  ["التجربة",[["pilotWeeks","مدة التجربة (أسابيع)"]]]
];
const CONFIG_LABELS = Object.fromEntries(CONFIG_GROUPS.flatMap(g => g[1]));
function pageRules(){
  const c = state.config;
  return pageHead("القواعد والميثاق", "أي تعديل هنا يغيّر التوصيات والإنذارات والتنبؤات فوراً، ويُوثَّق في سجل التدقيق. القرارات المعتمدة لا تتغير إلا باعتماد جديد.") + `
  <div class="stack">
    ${card({title:"قواعد الاحتساب", icon:"sliders", body:`
      <form id="rules" novalidate>${CONFIG_GROUPS.map(([g,fields]) => `<div class="rules-group"><h3>${g}</h3><div class="rules-grid">${fields.map(([k,l]) => `
        <div class="field"><label for="r-${k}">${l}</label><input class="input num" type="number" id="r-${k}" name="${k}" value="${c[k]}" data-act="config"></div>`).join("")}</div></div>`).join("")}</form>
      <p class="error" id="rules-error" role="alert"></p>`})}
    ${card({title:"مصفوفة تصنيف الوظائف", icon:"list", sub:"البوابة الأولى: هل تسمح طبيعة الوظيفة بالعمل عن بعد؟", body:`
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">الوظيفة</th><th scope="col">عدد الموظفين</th><th scope="col">التصنيف</th></tr></thead>
        <tbody>${state.roles.map(r => `<tr><td data-label="الوظيفة">${esc(r.title)}</td>
          <td data-label="الموظفون" class="num">${state.employees.filter(e => e.roleId===r.id).length}</td>
          <td data-label="التصنيف"><select class="input input-sm" data-act="suit" data-id="${r.id}" aria-label="تصنيف وظيفة ${esc(r.title)}">
            ${Object.entries(SUIT).map(([v,s]) => `<option value="${v}" ${r.suit===v?"selected":""}>${s.label}</option>`).join("")}</select></td></tr>`).join("")}</tbody>
      </table></div>`})}
    ${card({title:"ميثاق العمل عن بعد", icon:"report", sub:"مسودة، تُراجع مع الشؤون القانونية قبل الاعتماد", body:`<ol class="charter">${charterItems().map(i => `<li>${esc(i)}</li>`).join("")}</ol>`})}
  </div>`;
}

/* ---------- سجل التدقيق ---------- */
function pageAudit(){
  return pageHead("سجل التدقيق", "كل قرار وتدخل وتعديل: من نفّذه، ومتى، وماذا تغيّر. السجل للإضافة فقط ولا يمكن تعديله أو حذفه من الواجهة.") +
    card({title:"الأحداث الموثقة", icon:"shield", actions:`<span class="small muted num">${state.audit.length} حدثاً</span>`,
      body:`<ol class="timeline">${state.audit.map(a => `<li><div class="tl-top"><b>${esc(a.action)}</b><time datetime="${esc(a.ts)}">${fmtDT(a.ts)}</time></div>
        <p>${esc(a.detail)}</p><span class="small muted">${esc(a.actor)}</span></li>`).join("")}</ol>`});
}

/* ---------- التقرير التنفيذي ---------- */
function pageReport(){
  const s = generateExecutiveSummary();
  return pageHead("التقرير التنفيذي", "تقرير بصياغة استشارية يولّده محرك مدى محلياً من بيانات اللحظة، جاهز للعرض على القيادة. يتحدث تلقائياً مع كل قرار أو تعديل.",
      {actions:`<button class="btn btn-ghost" type="button" data-act="copy-report">${ICON.copy}نسخ النص</button><button class="btn btn-primary" type="button" data-act="print-report">${ICON.printer}طباعة أو حفظ PDF</button>`}) + `
  <article class="card report" aria-labelledby="r-title">
    <header class="report-band">
      <div class="r-meta"><span>مدى، تقرير تنفيذي</span><span>المرجع ${s.ref}</span><span>${fmtDateY(s.date)}</span><span>للاستخدام الداخلي</span></div>
      <h2 id="r-title">${esc(s.headline)}</h2>
      <p class="r-phase">${esc(s.phase)}</p>
    </header>
    <div class="report-body">
      <div class="r-kpis">${s.kpis.map(k => `<div><span>${k.l}</span><b class="num">${k.v}</b><small>${k.s}</small></div>`).join("")}</div>
      <section class="r-sec" aria-labelledby="rs1"><h3 id="rs1"><span class="r-n">1</span>الخلاصة التنفيذية</h3>${s.summary.map(p => `<p>${esc(p)}</p>`).join("")}</section>
      <section class="r-sec" aria-labelledby="rs2"><h3 id="rs2"><span class="r-n">2</span>النتائج الرئيسية</h3><ul>${s.findings.map(f => `<li><b>${esc(f.k)}:</b> ${esc(f.v)}</li>`).join("")}</ul></section>
      <section class="r-sec" aria-labelledby="rs3"><h3 id="rs3"><span class="r-n">3</span>المخاطر ونقاط الانتباه</h3><ul>${s.risks.map(r => `<li>${esc(r)}</li>`).join("")}</ul></section>
      <section class="r-sec" aria-labelledby="rs4"><h3 id="rs4"><span class="r-n">4</span>التوصية</h3>
        <div class="r-rec ${s.rec.tone}"><p class="r-rec-label">${esc(s.rec.label)}</p><p>${esc(s.rec.text)}</p></div>
        <ol>${s.steps.map(x => `<li>${esc(x)}</li>`).join("")}</ol></section>
      <section class="r-sec" aria-labelledby="rs5"><h3 id="rs5"><span class="r-n">5</span>المنهجية وحدود القياس</h3><p class="small">${esc(s.method)}</p></section>
    </div>
    <footer class="report-foot"><span>${ICON.sparkles}وُلِّد محلياً بواسطة محرك مدى التحليلي داخل المتصفح، دون إرسال أي بيانات.</span>${mockTag()}</footer>
  </article>`;
}

/* =========================================================
   13) الرسم
   ========================================================= */
const PAGES = {
  home:() => role()==="employee" ? pageMyHome() : role()==="executive" ? pageExec() : pageHome(),
  actions:pageActions, team:pageTeam, tasks:pageTasks, kafaa:pageKafaa, pilot:pagePilot, rules:pageRules, audit:pageAudit, report:pageReport
};
const THEMES = {auto:{label:"تلقائي حسب الجهاز",icon:"monitor"}, light:{label:"فاتح",icon:"sun"}, dark:{label:"داكن",icon:"moon"}};
const NEXT_THEME = {auto:"light", light:"dark", dark:"auto"};
let animateNext = true;

function applyTheme(){
  const t = state.session.theme;
  if (t==="auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
function renderThemeBtn(){
  const t = state.session.theme, b = document.getElementById("theme-btn");
  b.innerHTML = ICON[THEMES[t].icon];
  b.setAttribute("aria-label", `المظهر: ${THEMES[t].label}. التبديل إلى: ${THEMES[NEXT_THEME[t]].label}`);
  b.title = `المظهر: ${THEMES[t].label}`;
}
function renderShell(){
  const n = isLead() ? inboxCount() : 0, pi = pilotInfo(), c = state.config;
  document.getElementById("nav").innerHTML = NAV[role()].map(([id,label,icon]) => {
    const b = id==="actions" && n ? `<span class="count num">${n}<span class="sr-only"> بانتظار الإجراء</span></span>` : "";
    return `<button type="button" data-act="nav" data-page="${id}" ${state.session.page===id?'aria-current="page"':""}>${ICON[icon]}<span class="nl">${label}</span>${b}</button>`;
  }).join("");
  document.getElementById("side-foot").innerHTML = `
    <div class="mini-pilot"><div class="mp-top"><span>تجربة العمل عن بعد</span><b class="num">${pi.week} / ${c.pilotWeeks}</b></div>
      <div class="hz-mini" aria-hidden="true"><span style="inline-size:${pi.pct}%"></span><i style="inset-inline-start:${pi.pct}%"></i></div></div>
    <p class="side-note">نموذج أولي ببيانات وهمية. الأدوار هنا محاكاة، وفي النظام الفعلي تحددها بيانات الدخول.</p>
    <button class="side-link" type="button" data-act="reset">إعادة البيانات التجريبية</button>`;
  const page = (NAV[role()].find(([id]) => id===state.session.page) || [,""])[1];
  document.getElementById("crumbs").innerHTML = `<span>مدى</span>${ICON.chevron}<b>${page}</b>`;
  document.getElementById("role").value = role();
  document.getElementById("ac-slot").innerHTML = isLead()
    ? `<button type="button" class="ac-btn" data-act="nav" data-page="actions" aria-label="مركز الإجراءات: ${n} بانتظار الإجراء">${ICON.inbox}<span class="ac-txt">الإجراءات</span><span class="count num">${n}</span></button>` : "";
  const who = role()==="employee" ? self().name : actor();
  document.getElementById("user-chip").innerHTML = `<span class="avatar" aria-hidden="true">${initials(who)}</span><span class="who-txt">${esc(who)}<small>${role()==="employee" ? esc(roleOf(self()).title) : role()==="executive" ? "القيادة العليا" : ROLE_LABEL[role()]}</small></span>`;
  renderThemeBtn();
}
function renderDock(){
  const dock = document.getElementById("dock");
  if (!isLead() || state.session.page==="actions"){ dock.hidden = true; dock.innerHTML = ""; return; }
  const items = actionItems(), total = items.length;
  dock.hidden = false;
  if (state.session.dockMin){
    dock.className = "dock min";
    dock.innerHTML = `<button type="button" class="dock-fab" data-act="dock-min" aria-expanded="false" aria-label="إظهار شريط مركز الإجراءات: ${total} بانتظار الإجراء">${ICON.bolt}${total?`<span class="fab-count num" aria-hidden="true">${total}</span>`:""}</button>`;
    return;
  }
  dock.className = "dock";
  const segs = TABS.filter(([k]) => k!=="all").map(([k,l]) => {
    const xs = items.filter(i => KIND[i.kind].tab===k), hot = xs.some(i => i.prio >= 3);
    return `<button type="button" class="${hot?"hot":""}${xs.length?"":" zero"}" data-act="dock" data-tab="${k}" aria-label="${l}: ${xs.length}"><span>${l}</span><b class="num">${xs.length}</b></button>`;
  }).join("");
  dock.innerHTML = `<span class="dock-title"><span class="ic">${ICON.bolt}</span><span class="dt-txt">مركز الإجراءات</span></span>
    <div class="dock-seg">${segs}</div>
    <button type="button" class="btn btn-primary btn-sm" data-act="dock" data-tab="all">فتح المركز${total?` <span class="count num">${total}</span>`:""}</button>
    <button type="button" class="icon-btn sm" data-act="dock-min" aria-expanded="true" aria-label="تصغير شريط مركز الإجراءات">${ICON.minus}</button>`;
}
/* استعادة التركيز بعد إعادة الرسم: يُحدَّد العنصر بمعرّفه أو بسمات الإجراء */
function focusKey(el){
  if (!el || el===document.body || el===document.documentElement) return null;
  if (el.id) return "#" + cssEsc(el.id);
  const keys = ["act","id","page","tab","emp","course","key","task","i"];
  let sel = el.tagName.toLowerCase(), any = false;
  keys.forEach(k => { if (el.dataset && el.dataset[k]!=null){ sel += `[data-${k}="${cssEsc(el.dataset[k])}"]`; any = true; } });
  return any ? sel : null;
}
function render(){
  MEMO = {}; TIPS.clear(); tipSeq = 0; uidSeq = 0;
  hideTip(true);
  const fk = focusKey(document.activeElement);
  if (!NAV[role()].some(([id]) => id===state.session.page)) state.session.page = "home";
  renderShell();
  const main = document.getElementById("page");
  main.classList.toggle("animate", animateNext);
  main.innerHTML = continuityBanner() + PAGES[state.session.page]();
  animateNext = false;
  renderDock();
  if (fk){
    let el = null; try { el = document.querySelector(fk); } catch(e){}
    if (el && el !== document.activeElement){ try { el.focus({preventScroll:true}); } catch(e){} }
  }
}
function focusTitle(){
  const h = document.getElementById("page-title");
  if (h){ try { h.focus({preventScroll:true}); } catch(e){} }
  try { window.scrollTo(0,0); } catch(e){}
}

/* =========================================================
   14) التلميحات العائمة — تمرير، تركيز، نقر للتثبيت، Esc للإغلاق
   (تحقق معيار WCAG 1.4.13: قابلة للإغلاق، وللتمرير فوقها، ومستمرة)
   ========================================================= */
const tipEl = document.getElementById("tip");
let tipTarget = null, tipPinned = false, tipTimer = 0;
function placeTip(anchor){
  const r = anchor.getBoundingClientRect(), m = 10;
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
  let left = r.left + r.width/2 - tw/2, top = r.top - th - m, side = "top";
  if (top < 8){ top = r.bottom + m; side = "bottom"; }
  left = clamp(left, 8, Math.max(8, vw - tw - 8)); top = clamp(top, 8, Math.max(8, vh - th - 8));
  tipEl.style.left = left + "px"; tipEl.style.top = top + "px";
  tipEl.dataset.side = side;
  tipEl.style.setProperty("--ax", clamp(r.left + r.width/2 - left, 14, Math.max(14, tw - 14)) + "px");
}
function clearTipTarget(){
  if (!tipTarget) return;
  tipTarget.removeAttribute("aria-describedby");
  tipTarget.classList.remove("is-active");
  const ch = tipTarget.closest && tipTarget.closest(".chart"); if (ch) ch.classList.remove("has-active");
  tipTarget = null;
}
function showTip(el, pin){
  const html = TIPS.get(el.dataset.tip); if (!html) return;
  clearTimeout(tipTimer);
  if (tipTarget && tipTarget !== el) clearTipTarget();
  tipEl.innerHTML = html; tipTarget = el; tipPinned = !!pin;
  el.setAttribute("aria-describedby", "tip"); el.classList.add("is-active");
  const ch = el.closest(".chart"); if (ch) ch.classList.add("has-active");
  tipEl.classList.add("show");
  placeTip(el.querySelector("[data-anchor]") || el);
}
function hideTip(force){
  if (tipPinned && !force) return;
  clearTimeout(tipTimer); tipPinned = false;
  tipEl.classList.remove("show"); clearTipTarget();
}
function scheduleHide(){ clearTimeout(tipTimer); tipTimer = setTimeout(() => hideTip(false), 140); }
const tipHost = t => (t && t.closest) ? t.closest("[data-tip]") : null;
document.addEventListener("pointerover", e => {
  if (e.pointerType==="touch" || tipPinned) return;
  const el = tipHost(e.target); if (el) showTip(el, false);
});
document.addEventListener("pointerout", e => {
  if (e.pointerType==="touch" || tipPinned) return;
  const el = tipHost(e.target); if (el && !el.contains(e.relatedTarget)) scheduleHide();
});
tipEl.addEventListener("pointerenter", () => clearTimeout(tipTimer));
tipEl.addEventListener("pointerleave", () => { if (!tipPinned) scheduleHide(); });
document.addEventListener("focusin", e => { const el = tipHost(e.target); if (el && !tipPinned) showTip(el, false); });
document.addEventListener("focusout", e => { const el = tipHost(e.target); if (el && !tipPinned) scheduleHide(); });
document.addEventListener("click", e => {
  const el = tipHost(e.target);
  if (el){ if (tipPinned && tipTarget===el) hideTip(true); else showTip(el, true); return; }
  if (tipPinned && !tipEl.contains(e.target)) hideTip(true);
});
const reTip = () => { if (tipTarget && tipTarget.isConnected) placeTip(tipTarget.querySelector("[data-anchor]") || tipTarget); };
window.addEventListener("scroll", reTip, {passive:true});
window.addEventListener("resize", reTip);

/* =========================================================
   15) الحوار والإشعارات
   ========================================================= */
function toast(msg){
  const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = ICON.check + `<span>${esc(msg)}</span>`;
  document.getElementById("toasts").appendChild(el); setTimeout(() => el.remove(), 5200);
}
function ask({title, body="", fields=[], confirm="تأكيد", danger=false}){
  return new Promise(resolve => {
    const dlg = document.getElementById("dlg");
    const fieldHTML = f => {
      if (f.type==="select") return `<div class="field"><label for="df-${f.name}">${f.label}</label><select class="input" id="df-${f.name}" name="${f.name}">${f.options.map(o => `<option>${esc(o)}</option>`).join("")}</select></div>`;
      if (f.type==="textarea") return `<div class="field"><label for="df-${f.name}">${f.label}</label><textarea class="input" id="df-${f.name}" name="${f.name}" maxlength="300">${esc(f.value||"")}</textarea></div>`;
      if (f.type==="date") return `<div class="field"><label for="df-${f.name}">${f.label}</label><input class="input num" type="date" id="df-${f.name}" name="${f.name}" value="${f.value||""}"></div>`;
      if (f.type==="checkbox") return `<label class="check"><input type="checkbox" name="${f.name}"><span>${f.label}</span></label>`;
      return "";
    };
    dlg.innerHTML = `<form id="dlg-form" novalidate><div class="dlg-body"><h2 id="dlg-title">${esc(title)}</h2>${body}${fields.map(fieldHTML).join("")}
      <p class="error" id="dlg-err" role="alert"></p></div>
      <div class="dlg-foot"><button type="button" class="btn btn-ghost" id="dlg-cancel">إلغاء</button><button type="submit" class="btn ${danger?"btn-danger":"btn-primary"}">${esc(confirm)}</button></div></form>`;
    let done = false;
    const finish = v => { if (done) return; done = true; if (dlg.open) dlg.close(); resolve(v); };
    dlg.querySelector("#dlg-cancel").onclick = () => finish(null);
    dlg.oncancel = e => { e.preventDefault(); finish(null); };
    dlg.querySelector("#dlg-form").onsubmit = e => {
      e.preventDefault();
      const out = {};
      for (const f of fields){
        const el = dlg.querySelector(`[name="${f.name}"]`);
        const v = f.type==="checkbox" ? el.checked : el.value.trim();
        if (f.required && !v){ dlg.querySelector("#dlg-err").textContent = f.error || "أكمل الحقول المطلوبة."; el.focus(); return; }
        if (f.min && v.length < f.min){ dlg.querySelector("#dlg-err").textContent = `اكتب ${f.min} أحرف على الأقل في "${f.label}".`; el.focus(); return; }
        out[f.name] = v;
      }
      finish(out);
    };
    dlg.showModal();
  });
}

/* =========================================================
   16) الإجراءات — كل إجراء يتحقق من الصلاحية ويُوثَّق
   ========================================================= */
function goActions(tab){ state.session.page = "actions"; state.session.tab = tab || "all"; animateNext = true; persist(); render(); focusTitle(); }
const ACTIONS = {
  nav(d){ state.session.page = d.page; animateNext = true; persist(); render(); focusTitle(); },
  tab(d){ state.session.tab = d.tab; persist(); render(); },
  dock(d){ goActions(d.tab); },
  "dock-min"(){
    state.session.dockMin = !state.session.dockMin; persist(); MEMO = {}; renderDock();
    const b = document.querySelector('#dock [data-act="dock-min"]'); if (b) b.focus();
  },
  theme(){
    state.session.theme = NEXT_THEME[state.session.theme] || "auto"; persist(); applyTheme(); renderThemeBtn();
    toast(`المظهر: ${THEMES[state.session.theme].label}.`);
  },

  approve(d){
    if (!guard("decide")) return;
    const e = empById(d.id), from = e.decision.mode, to = targetDecision(e);
    mutate(() => { e.decision = {mode:to, date:todayISO(), by:actor()}; log("اعتماد نمط العمل", `${e.name}: من ${modeWord(from)} إلى ${modeWord(to)}`); });
    toast(`اعتُمد القرار: ${e.name}، ${decisionText(e)}.`);
  },
  async "approve-all"(){
    if (!guard("decide")) return;
    const list = state.employees.filter(isPending); if (!list.length) return;
    const v = await ask({title:"اعتماد كل التوصيات", body:`<p class="small">يُعتمد نمط العمل الموصى به للموظفين التالية أسماؤهم، ويُوثَّق كل قرار منفرداً في سجل التدقيق:</p>
      <ul class="mini-list">${list.map(e => `<li><b>${esc(e.name)}</b>: من ${modeWord(e.decision.mode)} إلى ${modeWord(targetDecision(e))}</li>`).join("")}</ul>`, confirm:`اعتماد (${list.length})`});
    if (!v) return;
    mutate(() => list.forEach(e => { const from = e.decision.mode, to = targetDecision(e); e.decision = {mode:to, date:todayISO(), by:actor()}; log("اعتماد نمط العمل", `${e.name}: من ${modeWord(from)} إلى ${modeWord(to)} (اعتماد جماعي)`); }));
    toast(`اعتُمدت ${list.length} توصيات.`);
  },
  async hold(d){
    if (!guard("decide")) return;
    const e = empById(d.id);
    const v = await ask({title:"إبقاء القرار المعتمد", body:`<p class="small">${esc(e.name)}: التوصية ${modeWord(targetDecision(e))}، والقرار المعتمد ${modeWord(e.decision.mode)}. مخالفة التوصية تتطلب سبباً مكتوباً يُوثَّق في سجل التدقيق.</p>`,
      fields:[{type:"textarea",name:"note",label:"سبب الإبقاء",required:true,min:10}], confirm:"إبقاء القرار"});
    if (!v) return;
    mutate(() => { e.decision.heldFor = recommend(e)+":"+targetDecision(e); log("إبقاء قرار مخالف للتوصية", `${e.name}: ${v.note}`); });
  },

  /* التدخل الإداري */
  async recall(d){
    if (!guard("intervene")) return;
    const e = empById(d.id);
    if (e.decision.mode!=="remote" || recallActive(e)) return;
    const v = await ask({title:"استدعاء حضوري مؤقت",
      body:`<p class="small">${esc(e.name)} يعود إلى الدوام الحضوري للمدة المحددة، ثم يعود قراره المعتمد تلقائياً. يرى الموظف السبب والمدة في صفحته.</p>`,
      fields:[{type:"select",name:"reason",label:"السبب",options:["تأخر متكرر في المخرجات","انخفاض عن خط الأساس","متطلبات تشغيلية"]},
              {type:"select",name:"dur",label:"المدة",options:["أسبوع واحد","أسبوعان"]},
              {type:"textarea",name:"note",label:"ما المطلوب تصحيحه خلال المدة",required:true,min:10}], confirm:"تأكيد الاستدعاء", danger:true});
    if (!v) return;
    const days = v.dur==="أسبوعان" ? 14 : 7;
    mutate(() => {
      e.recall = {reason:v.reason, note:v.note, from:todayISO(), until:isoOffset(days), by:actor()};
      (e.interventions = e.interventions||[]).unshift({type:"recall", date:todayISO(), note:`${v.reason}: ${v.note}`, by:actor()});
      log("استدعاء حضوري مؤقت", `${e.name}: ${v.reason}، لمدة ${daysWord(days)}، ${v.note}`);
    });
    toast(`استُدعي ${e.name} للعمل حضورياً حتى ${fmtDate(isoOffset(days))}.`);
  },
  async followup(d){
    if (!guard("intervene")) return;
    const e = empById(d.id);
    const v = await ask({title:"تسجيل متابعة موثقة", body:`<p class="small">تدخل دون استدعاء: اجتماع تصحيحي أو إعادة جدولة أو دعم. يُوثَّق ويُحتسب في معدل المحاسبية.</p>`,
      fields:[{type:"textarea",name:"note",label:"ما الذي اتُّفق عليه",required:true,min:10}], confirm:"توثيق المتابعة"});
    if (!v) return;
    mutate(() => {
      (e.interventions = e.interventions||[]).unshift({type:"followup", date:todayISO(), note:v.note, by:actor()});
      log("متابعة موثقة", `${e.name}: ${v.note}`);
    });
    toast(`وُثّقت المتابعة مع ${e.name}.`);
  },
  async preventive(d){
    if (!guard("intervene")) return;
    const e = empById(d.id), t = d.task ? state.tasks.find(x => x.id===d.task) : null;
    const v = await ask({title:"إجراء استباقي قبل وقوع التأخر",
      body:`<p class="small">${esc(e.name)}${t ? `: ${esc(t.title)}، موعده ${fmtDate(t.deadline)} والإنجاز ${t.progress}%` : ""}. الإجراء الاستباقي يُوثَّق ولا يمس النقاط أو نمط العمل.</p>`,
      fields:[{type:"select",name:"kind",label:"نوع الإجراء",options:["اجتماع متابعة قصير","إعادة ترتيب أولويات التكليفات","دعم فني أو موارد إضافية","الاتفاق على موعد معدّل"]},
              {type:"textarea",name:"note",label:"ما الذي اتُّفق عليه",required:true,min:10,
               value:t ? `مراجعة خطة إنجاز "${t.title}" والتأكد من إمكانية تسليمه في موعده.` : "مراجعة اتجاه سرعة التسليم ووضع خطة لاستعادته."}], confirm:"توثيق الإجراء"});
    if (!v) return;
    mutate(() => {
      (e.interventions = e.interventions||[]).unshift({type:"preventive", date:todayISO(), note:`${v.kind}: ${v.note}`, by:actor()});
      log("إجراء استباقي", `${e.name}${t ? `: ${t.title}` : ""}، ${v.kind}`);
    });
    toast(`وُثّق الإجراء الاستباقي لـ${e.name}.`);
  },
  "end-recall"(d){
    if (!guard("intervene")) return;
    const e = empById(d.id);
    mutate(() => { e.recall = null; log("إنهاء استدعاء حضوري", `${e.name}: عودة إلى القرار المعتمد (${modeWord(e.decision.mode)})`); });
  },

  async "appeal-new"(d){
    if (!guard("self")) return;
    const t = state.tasks.find(x => x.id===d.id);
    if (t.emp!==SELF_ID || t.appeal) return;
    const v = await ask({title:"الاعتراض على الخصم", body:`<p class="small">${esc(t.title)}. يراجع مديرك الاعتراض، وإن قُبل يُستبعد الخصم من رصيدك ومن مؤشر الالتزام. اذكر دليلاً قابلاً للتحقق (رقم بلاغ، أو مراسلة، أو مرفق) والمدة بدقة.</p>`,
      fields:[{type:"select",name:"reason",label:"السبب",options:["عطل تقني","وضع طارئ أو استمرارية أعمال","تغيير في نطاق التكليف أو موعده","أخرى"]},
              {type:"textarea",name:"note",label:"التوضيح والدليل المتاح",required:true,min:10}], confirm:"إرسال الاعتراض"});
    if (!v) return;
    mutate(() => { t.appeal = {reason:v.reason, note:v.note, status:"pending", date:todayISO()}; log("اعتراض على خصم", `${t.title}: ${v.reason}`); });
    toast("أُرسل الاعتراض إلى مديرك.");
  },
  "appeal-accept"(d){
    if (!guard("appeals")) return;
    const t = state.tasks.find(x => x.id===d.id);
    const a = assessAppeal(t);
    mutate(() => { t.appeal.status = "accepted"; t.appeal.by = actor(); log("قبول اعتراض", `${empById(t.emp).name}: ${t.title} (اقتراح المساعد: ${a.label}، ${a.score}/100)`); });
    toast("قُبل الاعتراض واستُبعد الخصم.");
  },
  async "appeal-reject"(d){
    if (!guard("appeals")) return;
    const t = state.tasks.find(x => x.id===d.id), a = assessAppeal(t);
    const v = await ask({title:"رفض الاعتراض", body:`<p class="small">يظهر سبب الرفض للموظف في قائمة تكليفاته. النص التالي مقترح من المساعد التحليلي، عدّله كما تراه مناسباً.</p>`,
      fields:[{type:"textarea",name:"note",label:"سبب الرفض",required:true,min:10,value:a.reply}], confirm:"رفض الاعتراض"});
    if (!v) return;
    mutate(() => { t.appeal.status = "rejected"; t.appeal.rejectNote = v.note; t.appeal.by = actor(); log("رفض اعتراض", `${empById(t.emp).name}: ${t.title}، ${v.note}`); });
  },

  status(d, el){
    if (!guard("tasks")){ render(); return; }
    const t = state.tasks.find(x => x.id===d.id), before = STATE_LABEL[taskState(t)];
    mutate(() => {
      t.status = el.value;
      if (t.status==="done"){ t.progress = 100; t.completedAt = todayISO(); } else delete t.completedAt;
      log(t.status==="done" ? "اعتماد مخرج" : "تغيير حالة تكليف", `${t.title}: من ${before} إلى ${STATE_LABEL[taskState(t)]}`);
    });
  },
  progress(d, el){
    if (!guard("self")) return;
    const t = state.tasks.find(x => x.id===d.id);
    if (t.emp!==SELF_ID) return;
    mutate(() => { t.progress = Number(el.value); log("تحديث نسبة إنجاز", `${t.title}: ${t.progress}%`); });
  },
  filter(d, el){ state.session[d.key] = el.value; persist(); render(); },

  async "sign-charter"(){
    if (!guard("self")) return;
    const v = await ask({title:"ميثاق العمل عن بعد", body:`<ol class="charter small">${charterItems().map(i => `<li>${esc(i)}</li>`).join("")}</ol>`,
      fields:[{type:"checkbox",name:"agree",label:"قرأت الميثاق وألتزم به.",required:true,error:"يجب الموافقة على الميثاق قبل التوقيع."}], confirm:"توقيع الميثاق"});
    if (!v) return;
    mutate(() => { self().charterSigned = true; log("توقيع الميثاق", self().name); });
  },
  async "declare-home"(){
    if (!guard("self")) return;
    const v = await ask({title:"إقرار جاهزية مكان العمل", body:`<p class="small">أقر بتوفر ما يلي في مكان عملي بالمنزل:</p>`,
      fields:[{type:"checkbox",name:"a",label:"اتصال إنترنت مستقر يكفي للاجتماعات المرئية.",required:true,error:"أكّد جميع البنود."},
              {type:"checkbox",name:"b",label:"مكان هادئ يحمي سرية المعلومات من اطلاع الآخرين.",required:true,error:"أكّد جميع البنود."},
              {type:"checkbox",name:"c",label:"إمكانية الحضور إلى المقر عند الاستدعاء خلال يوم العمل.",required:true,error:"أكّد جميع البنود."}], confirm:"تأكيد الإقرار"});
    if (!v) return;
    mutate(() => { self().homeReady = true; log("إقرار جاهزية مكان العمل", self().name); });
  },
  consent(d, el){
    if (!guard("self")) return;
    mutate(() => { self().consent = el.checked; log(el.checked ? "موافقة على الظهور في لوحة التقدير" : "سحب الموافقة على الظهور", self().name); });
  },

  "course-self"(d){
    if (!guard("self") || completionOf(SELF_ID, d.id)) return;
    mutate(() => { state.completions.push({emp:SELF_ID, course:d.id, status:"pending", date:todayISO()}); log("طلب توثيق شهادة", courseById(d.id).title); });
    toast("سُجّل طلبك. تُضاف النقاط بعد توثيق مديرك للشهادة.");
  },
  verify(d){
    if (!guard("verify")) return;
    const x = completionOf(d.emp, d.course);
    mutate(() => { x.status = "verified"; x.by = actor(); log("توثيق شهادة", `${empById(d.emp).name}: ${courseById(d.course).title}`); });
    toast("وُثّقت الشهادة وأُضيفت النقاط.");
  },
  async "verify-reject"(d){
    if (!guard("verify")) return;
    const v = await ask({title:"رفض توثيق الشهادة", fields:[{type:"textarea",name:"note",label:"السبب (مثل: الشهادة غير مرفقة)",required:true,min:10}], confirm:"رفض"});
    if (!v) return;
    mutate(() => { state.completions = state.completions.filter(x => !(x.emp===d.emp && x.course===d.course)); log("رفض توثيق شهادة", `${empById(d.emp).name}: ${courseById(d.course).title}، ${v.note}`); });
  },
  "course-register"(d){
    if (!guard("verify")) return;
    const emp = document.getElementById("reg-"+d.id).value;
    if (completionOf(emp, d.id)) return;
    mutate(() => { state.completions.push({emp, course:d.id, status:"verified", date:todayISO(), by:actor()}); log("تسجيل شهادة موثقة", `${empById(emp).name}: ${courseById(d.id).title}`); });
  },

  async "cont-on"(){
    if (!guard("continuity")) return;
    const v = await ask({title:"تفعيل وضع استمرارية الأعمال",
      fields:[{type:"select",name:"reason",label:"السبب",options:["أنواء مناخية","أزمة صحية","عطل في المقر","أخرى"]},
              {type:"date",name:"until",label:"حتى تاريخ",value:isoOffset(2),required:true}], confirm:"تفعيل الوضع"});
    if (!v) return;
    mutate(() => { state.continuity = {active:true, reason:v.reason, until:v.until, by:actor()}; log("تفعيل استمرارية الأعمال", `${v.reason} حتى ${v.until}`); });
  },
  "cont-off"(){
    if (!guard("continuity")) return;
    mutate(() => { state.continuity = {active:false, reason:"", until:"", by:""}; log("إنهاء استمرارية الأعمال", "العودة إلى القرارات المعتمدة"); });
  },

  config(){
    if (!guard("rules")) return;
    const f = document.getElementById("rules"), err = document.getElementById("rules-error"), next = {};
    for (const el of f.elements){
      if (!el.name) continue;
      const v = Number(el.value);
      if (el.value==="" || !Number.isFinite(v)){ err.textContent = "أدخل رقماً صحيحاً في كل حقل."; return; }
      next[el.name] = Math.round(v);
    }
    if (next.officeMin > next.remoteMin){ err.textContent = "يجب ألا يتجاوز الحد الأدنى حد العمل عن بعد."; return; }
    if (next.pilotWeeks < 1 || next.daysFull < 0 || next.daysPartial < 0 || next.earlyDays < 1 || next.warnLate < 1 || next.warnWindow < 1 || next.warnDrop < 1 || next.predictHorizon < 1){
      err.textContent = "المدد والأيام وحدود الإنذار والتنبؤ يجب أن تكون أرقاماً موجبة."; return; }
    if (next.predictThreshold < 1 || next.predictThreshold > 100){ err.textContent = "حد التنبيه التنبؤي يجب أن يكون بين 1 و100."; return; }
    const changed = Object.keys(next).filter(k => next[k]!==state.config[k]);
    if (!changed.length) return;
    err.textContent = "";
    mutate(() => { log("تعديل قواعد الاحتساب", changed.map(k => `${CONFIG_LABELS[k]}: من ${state.config[k]} إلى ${next[k]}`).join("، ")); Object.assign(state.config, next); });
  },
  suit(d, el){
    if (!guard("rules")) return;
    const r = state.roles.find(x => x.id===d.id), from = r.suit;
    mutate(() => { r.suit = el.value; log("تعديل تصنيف وظيفة", `${r.title}: من ${SUIT[from].short} إلى ${SUIT[r.suit].short}`); });
  },

  async "copy-report"(){
    const txt = generateExecutiveSummary().text;
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext){ await navigator.clipboard.writeText(txt); ok = true; } } catch(e){}
    if (!ok){
      try {
        const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly",""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch(e){}
    }
    toast(ok ? "نُسخ نص التقرير. الصقه في البريد أو المستند." : "تعذّر النسخ التلقائي. حدّد نص التقرير وانسخه يدوياً.");
  },
  "print-report"(){ try { window.print(); } catch(e){ toast("تعذّرت الطباعة من هذه النافذة. استخدم أمر الطباعة في المتصفح."); } },

  role(d, el){
    state.session.role = el.value; state.session.page = "home"; state.session.fEmp = "all"; state.session.tab = "all";
    animateNext = true; persist(); render(); toast(`تعرض النظام الآن بصفة: ${el.options[el.selectedIndex].text}.`);
  },
  async reset(){
    const v = await ask({title:"إعادة البيانات التجريبية", body:`<p class="small">تُحذف كل التعديلات المحفوظة في هذا المتصفح، ويعود النظام إلى البيانات الوهمية الأولى.</p>`, confirm:"إعادة البيانات"});
    if (!v) return;
    const theme = state.session.theme;
    Store.clear(); state = seedData(); state.session.theme = theme; persist(); animateNext = true; applyTheme(); render(); toast("أُعيدت البيانات التجريبية.");
  }
};

/* حاسبة التقدير الذاتي: تُحدَّث نتيجتها فقط دون إعادة رسم الصفحة، فيبقى التركيز على المدخل */
let calcSayTimer = 0;
function updateCalc(){
  const root = document.getElementById("calc"); if (!root) return;
  const e = self(), b = calcBounds(e);
  const s = {
    target:Number(root.querySelector("#calc-target").value),
    weeks:Number(root.querySelector("#calc-weeks").value),
    early:Number((root.querySelector('input[name="calc-early"]:checked') || {value:50}).value),
    courses:[...root.querySelectorAll('input[name="calc-course"]:checked')].map(x => x.value)
  };
  state.session.calc = s; persist();
  const t = root.querySelector("#calc-target"), w = root.querySelector("#calc-weeks");
  t.style.setProperty("--fill", ((s.target-b.min)/((b.max-b.min)||1)*100).toFixed(1)+"%");
  w.style.setProperty("--fill", ((s.weeks-1)/5*100).toFixed(1)+"%");
  root.querySelector("#calc-target-o").textContent = `${s.target} نقطة`;
  root.querySelector("#calc-weeks-o").textContent = plural(s.weeks, W_WEEKS);
  document.getElementById("calc-out").innerHTML = calcOutHTML(e, s);
  clearTimeout(calcSayTimer);
  calcSayTimer = setTimeout(() => { const say = document.getElementById("calc-say"); if (say) say.textContent = calcSay(e, s); }, 450);
}

/* =========================================================
   17) ربط الأحداث (تفويض)
   ========================================================= */
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-act]"); if (!b) return;
  const fn = ACTIONS[b.dataset.act]; if (fn) fn(b.dataset, b);
});
document.addEventListener("change", e => {
  const el = e.target.closest("select[data-act],input[data-act]"); if (!el) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) fn(el.dataset, el);
});
document.addEventListener("input", e => { if (e.target.closest("[data-calc]")) updateCalc(); });
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id !== "add-task" || !guard("tasks")) return;
  const err = document.getElementById("task-error");
  const emp = document.getElementById("n-emp").value;
  const title = document.getElementById("n-title").value.trim();
  const kpi = document.getElementById("n-kpi").value.trim();
  const deadline = document.getElementById("n-date").value;
  if (!title || !kpi || !deadline){ err.textContent = "أكمل وصف التكليف والمخرج المتوقع والموعد النهائي قبل الإصدار."; return; }
  mutate(() => { state.tasks.push({id:"t"+Date.now(), emp, title, kpi, deadline, status:"progress", progress:0}); log("إصدار تكليف", `${empById(emp).name}: ${title}`); });
  toast(`صدر التكليف إلى ${empById(emp).name}.`);
});
/* التنقل بالأسهم داخل المخطط والتبويبات (roving tabindex)، وEsc لإغلاق التلميح */
document.addEventListener("keydown", e => {
  if (e.key==="Escape" && tipEl.classList.contains("show")){ hideTip(true); return; }
  const item = e.target.closest && e.target.closest("[data-rove-item]"); if (!item) return;
  const box = item.closest("[data-rove]"); if (!box) return;
  const items = [...box.querySelectorAll("[data-rove-item]")], i = items.indexOf(item);
  let n;
  if (e.key==="ArrowLeft") n = i+1; else if (e.key==="ArrowRight") n = i-1;
  else if (e.key==="Home") n = 0; else if (e.key==="End") n = items.length-1; else return;
  e.preventDefault();
  n = (n + items.length) % items.length;
  items.forEach(x => x.setAttribute("tabindex", "-1"));
  items[n].setAttribute("tabindex", "0"); items[n].focus();
  if (box.dataset.rove==="tabs") items[n].click();
});
applyTheme();
render();
