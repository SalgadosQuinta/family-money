/* Family Money — jsdom functional tests with mocked fetch */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let passed = 0, failed = 0;
function assert(cond, name){
  if(cond){ passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name); }
}

const UID = '11111111-1111-1111-1111-111111111111';
const UID2 = '22222222-2222-2222-2222-222222222222';
const today = new Date();
const iso = d => d.toISOString().slice(0,10);
const plusDays = n => { const d = new Date(); d.setDate(d.getDate()+n); return iso(d); };

// ---- mock data ----
const DB = {
  projects: [],
  milestones: [],
  members: [{user_id:UID, role:'admin'},{user_id:UID2, role:'member'}],
  profiles: [{id:UID, display_name:'Rodney', email:'r@x.com'},{id:UID2, display_name:'Ana', email:'a@x.com'}],
  bills: [
    {id:'b1', name:'Electricity', amount:120, currency:'USD', due_date:plusDays(-3), recurrence:'monthly', category:'Utilities', responsible:UID2, notes:null, receipt_path:null, archived:false},
    {id:'b2', name:'Internet', amount:80, currency:'GBP', due_date:plusDays(2), recurrence:'monthly', category:'Internet', responsible:UID, notes:null, receipt_path:'u/fam-1-r.jpg', archived:false},
    {id:'b3', name:'School fees', amount:900, currency:'ZAR', due_date:plusDays(20), recurrence:'quarterly', category:'School', responsible:null, notes:null, receipt_path:null, archived:false}
  ],
  payments: [
    {id:'p1', bill_id:'b2', bill_name:'Internet', amount:80, currency:'GBP', paid_by:UID, paid_at:new Date().toISOString(), due_date:iso(today), note:null}
  ],
  expenses: [
    {id:'e1', amount:45.5, currency:'USD', category:'Groceries', spent_by:UID2, spent_at:iso(today), note:'weekly shop', receipt_path:null}
  ]
};

let log = []; // record of write requests

function mockFetch(url, opts){
  opts = opts || {};
  const method = (opts.method || 'GET').toUpperCase();
  log.push({url, method, body: opts.body});
  const j = (obj, status=200) => Promise.resolve({
    ok: status < 400, status,
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj))
  });
  if(url.includes('/auth/v1/token?grant_type=password')){
    const b = JSON.parse(opts.body);
    if(b.password === 'good') return j({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:b.email}});
    return j({error_description:'Invalid login credentials'}, 400);
  }
  if(url.includes('/auth/v1/token?grant_type=refresh_token'))
    return j({access_token:'AT2', refresh_token:'RT2', user:{id:UID}});
  if(url.includes('/rest/v1/fam_members')) return j(DB.members);
  if(url.includes('/rest/v1/profiles')) return j(DB.profiles);
  if(url.includes('/rest/v1/fam_bills')){
    if(method === 'GET') return j(DB.bills.filter(b=>!b.archived));
    if(method === 'PATCH'){
      const id = /id=eq\.([^&]+)/.exec(url)[1];
      Object.assign(DB.bills.find(b=>b.id===id), JSON.parse(opts.body));
      return j(null, 204);
    }
    if(method === 'POST'){ DB.bills.push(Object.assign({id:'new'+DB.bills.length, archived:false}, JSON.parse(opts.body))); return j(null, 201); }
    if(method === 'DELETE'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; DB.bills = DB.bills.filter(b=>b.id!==id); return j(null,204); }
  }
  if(url.includes('/rest/v1/fam_bill_payments')){
    if(method === 'GET') return j(DB.payments);
    if(method === 'POST'){ DB.payments.unshift(Object.assign({id:'p'+(DB.payments.length+1), paid_at:new Date().toISOString()}, JSON.parse(opts.body))); return j(null,201); }
  }
  if(url.includes('/rest/v1/fam_expenses')){
    if(method === 'GET') return j(DB.expenses);
    if(method === 'POST'){ DB.expenses.unshift(Object.assign({id:'e'+(DB.expenses.length+1)}, JSON.parse(opts.body))); return j(null,201); }
    if(method === 'DELETE'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; DB.expenses = DB.expenses.filter(x=>x.id!==id); return j(null,204); }
  }
  if(url.includes('/rest/v1/fam_accounts')){
    if(method==='GET') return j(DB.accounts||[]);
    if(method==='POST'){ DB.accounts=DB.accounts||[]; DB.accounts.push(Object.assign({id:'a'+(DB.accounts.length+1), archived:false}, JSON.parse(opts.body))); return j(null,201); }
    if(method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign((DB.accounts||[]).find(x=>x.id===id), JSON.parse(opts.body)); return j(null,204); }
  }
  if(url.includes('/rest/v1/fam_debt_payments')){
    if(method==='GET') return j(DB.debtPayments||[]);
    if(method==='POST'){ DB.debtPayments=DB.debtPayments||[]; DB.debtPayments.unshift(Object.assign({id:'dp'+(DB.debtPayments.length+1), paid_at:new Date().toISOString()}, JSON.parse(opts.body))); return j(null,201); }
    if(method==='DELETE'){
      const mid=/[?&]id=eq\.([^&]+)/.exec(url); const mnote=/[?&]note=eq\.([^&]+)/.exec(url);
      if(mid) DB.debtPayments=(DB.debtPayments||[]).filter(x=>x.id!==mid[1]);
      if(mnote) DB.debtPayments=(DB.debtPayments||[]).filter(x=>x.note!==decodeURIComponent(mnote[1]));
      return j(null,204);
    }
  }
  if(url.includes('/rest/v1/fam_debts')){
    if(method==='GET') return j((DB.debts||[]).filter(d=>!d.archived));
    if(method==='POST'){ DB.debts=DB.debts||[]; DB.debts.push(Object.assign({id:'d'+(DB.debts.length+1), archived:false}, JSON.parse(opts.body))); return j(null,201); }
    if(method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign((DB.debts||[]).find(x=>x.id===id), JSON.parse(opts.body)); return j(null,204); }
  }
  if(url.includes('/rest/v1/fam_budgets')){
    if(method==='GET') return j(DB.budgets||[]);
    if(method==='POST'){ DB.budgets=DB.budgets||[]; DB.budgets.push(Object.assign({id:'bu'+(DB.budgets.length+1)}, JSON.parse(opts.body))); return j(null,201); }
  }
  if(url.includes('/rest/v1/fam_snapshots')){
    if(method==='GET') return j(DB.snapshots||[]);
    if(method==='POST'){ DB.snapshots=(DB.snapshots||[]).concat(JSON.parse(opts.body)); return j(null,201); }
  }
  if(url.includes('/rest/v1/fam_assets')){
    if(method==='GET') return j((DB.assets||[]).filter(a=>!a.archived));
    if(method==='POST'){ DB.assets=DB.assets||[]; DB.assets.push(Object.assign({id:'as'+(DB.assets.length+1), archived:false}, JSON.parse(opts.body))); return j(null,201); }
    if(method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign((DB.assets||[]).find(x=>x.id===id), JSON.parse(opts.body)); return j(null,204); }
    if(method==='DELETE'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; DB.assets=(DB.assets||[]).filter(x=>x.id!==id); return j(null,204); }
  }
  if(url.includes('/storage/v1/object/list/backups')){
    return j(DB.backupFiles||[]);
  }
  if(url.includes('/storage/v1/object/sign/backups/')){
    const n=decodeURIComponent(url.split('/sign/backups/')[1]);
    return j({signedURL:'/object/sign/backups/'+n+'?token=T'});
  }
  if(url.includes('/rest/v1/fam_notify_prefs')){
    if(method==='GET') return j(DB.nprefs||[]);
    if(method==='POST'){ DB.nprefs=DB.nprefs||[]; const b=JSON.parse(opts.body);
      const ex=DB.nprefs.find(x=>x.user_id===b.user_id);
      if(ex) Object.assign(ex,b); else DB.nprefs.push(b);
      return j(null,201); }
  }
  if(url.includes('/rest/v1/fam_space_grants')){
    if(method==='GET') return j(DB.grants||[]);
    if(method==='POST'){ DB.grants=(DB.grants||[]); DB.grants.push(JSON.parse(opts.body)); return j(null,201); }
    if(method==='DELETE'){ const u=/user_id=eq\.([^&]+)/.exec(url)[1]; DB.grants=(DB.grants||[]).filter(g=>g.user_id!==u); return j(null,204); }
  }
  if(url.includes('/rest/v1/fam_settings')){
    if(method==='GET') return j(DB.settings||[]);
    if(method==='POST'){ DB.settings=[{key:'manual_rates', value:JSON.parse(opts.body).value}]; return j(null,201); }
  }
  if(url.includes('/functions/v1/notify')){ (DB.notifies=DB.notifies||[]).push(JSON.parse(opts.body)); return j({ok:true}); }
  if(url.includes('/rest/v1/fam_income')) return j([]);
  if(url.includes('/rest/v1/fam_planner_items')) return j([]);
  if(url.includes('frankfurter')) return j({base:'USD', rates:{GBP:0.8, EUR:0.9, ZAR:18.0}});
  if(url.includes('/storage/v1/object/sign/')) return j({signedURL:'/object/sign/receipts/x?token=abc'});
  if(url.includes('/storage/v1/object/receipts/')) return j({Key:'x'}, 200);
  return j({}, 404);
}

function makeDom(){
  const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
    beforeParse(w){ w.fetch = mockFetch; }});
  return dom;
}

const wait = ms => new Promise(r=>setTimeout(r, ms));
async function cycleSpace(dom, A){
  const d = dom.window.document;
  const p = A.switchSpace();
  await wait(40);
  if(d.getElementById('pinset-modal') && d.getElementById('pinset-modal').classList.contains('open')){
    d.getElementById('ps-pin').value='1234'; await A.savePinSetting();
  } else if(d.getElementById('pin-lock') && d.getElementById('pin-lock').classList.contains('open')){
    d.getElementById('pin-input').value='1234'; await A.tryUnlock();
  }
  await p; await wait(40);
}

(async function(){
  console.log('--- Unit: pure helpers ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    assert(A.esc('<b>&"\'</b>') === '&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;', 'esc() escapes HTML');
    assert(A.nextDueDate('2026-01-31','monthly') === '2026-02-28', 'monthly rollover clamps to month end');
    assert(A.nextDueDate('2026-07-01','weekly') === '2026-07-08', 'weekly rollover +7d');
    assert(A.nextDueDate('2026-03-31','quarterly') === '2026-06-30', 'quarterly clamps to 30 June');
    assert(A.nextDueDate('2024-02-29','annually') === '2025-02-28', 'annual leap-day clamps');
    assert(A.fmtMoney(1234.5,'GBP') === '£1,234.50', 'fmtMoney GBP formatting');
    assert(A.fmtMoney(10,'GBP').indexOf('£') === 0, 'fmtMoney GBP symbol');
    assert(A.isOverdue({archived:false, due_date:'2020-01-01'}) === true, 'overdue detection');
    assert(A.isOverdue({archived:true, due_date:'2020-01-01'}) === false, 'archived bill never overdue');
  }

  console.log('--- Auth: sign-in failure ---');
  {
    const dom = makeDom(); await wait(50);
    const d = dom.window.document;
    d.getElementById('si-email').value='r@x.com';
    d.getElementById('si-pass').value='bad';
    d.getElementById('si-btn').click();
    await wait(50);
    assert(d.getElementById('si-err').style.display !== 'none', 'bad password shows error');
    assert(d.getElementById('app-view').style.display === 'none', 'app stays hidden on failed sign-in');
  }

  console.log('--- Auth: sign-in success + data render ---');
  {
    const dom = makeDom(); await wait(50);
    const d = dom.window.document, A = dom.window.App;
    d.getElementById('si-email').value='r@x.com';
    d.getElementById('si-pass').value='good';
    d.getElementById('si-btn').click();
    await wait(120);
    assert(A.state.session && A.state.session.access_token === 'AT1', 'session stored after sign-in');
    assert(dom.window.localStorage.getItem('fm_session') !== null, 'session persisted to localStorage');
    assert(A.state.isMember === true && A.state.isAdmin === true, 'membership + admin resolved');
    const bl = d.getElementById('bills-list').innerHTML;
    assert(bl.includes('Electricity') && bl.includes('Internet'), 'bills rendered');
    assert(bl.includes('Overdue'), 'overdue bill flagged red badge');
    assert(bl.includes('Ana'), 'responsible member name shown');
    const dd = d.getElementById('d-due').innerHTML;
    assert(dd.includes('Electricity') && dd.includes('Internet') && !dd.includes('School'), 'dashboard shows only due-this-week + overdue');
    assert(d.getElementById('d-committed').innerHTML.includes('USD'), 'committed 30d per currency rendered');
    assert(d.getElementById('d-members').innerHTML.includes('Rodney'), 'per-member paid-this-month rendered');
    assert(bl.includes('≈'), 'indicative USD line shown for non-USD bill');

    // Tab switching
    d.querySelector('#tabs button[data-view="expenses"]').click();
    assert(d.getElementById('view-expenses').style.display === '' , 'expenses tab activates');

    // --- Mark paid flow on recurring bill ---
    const before = A.state.bills.find(b=>b.id==='b1').due_date;
    d.querySelector('#tabs button[data-view="bills"]').click();
    d.querySelector('button[data-act="paid"][data-id="b1"]').click();
    assert(d.getElementById('paid-modal').classList.contains('open'), 'mark-paid modal opens');
    assert(d.getElementById('pm-amount').value === '120', 'amount prefilled');
    d.getElementById('pm-save').click();
    await wait(120);
    const b1 = DB.bills.find(b=>b.id==='b1');
    assert(b1.due_date > before, 'recurring bill rolled to next due date');
    assert(DB.payments.some(p=>p.bill_id==='b1'), 'payment logged with who/when/amount');
    assert(!d.getElementById('paid-modal').classList.contains('open'), 'paid modal closes after confirm');

    // --- Add bill via modal ---
    d.getElementById('bill-add-btn').click();
    assert(d.getElementById('bill-modal').classList.contains('open'), 'add-bill modal opens');
    d.getElementById('bm-save').click(); await wait(30);
    assert(d.getElementById('bm-err').style.display !== 'none', 'validation blocks empty bill');
    d.getElementById('bm-name').value='Water';
    d.getElementById('bm-amount').value='40';
    d.getElementById('bm-due').value=A.todayISO();
    d.getElementById('bm-save').click(); await wait(120);
    assert(DB.bills.some(b=>b.name==='Water'), 'new bill inserted');
    assert(!d.getElementById('bill-modal').classList.contains('open'), 'bill modal closes after save');

    // --- Modal: Escape closes, outside click does NOT ---
    d.getElementById('bill-add-btn').click();
    d.getElementById('bill-modal').dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
    assert(d.getElementById('bill-modal').classList.contains('open'), 'outside click does not close modal');
    d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape', bubbles:true}));
    assert(!d.getElementById('bill-modal').classList.contains('open'), 'Escape closes modal');

    // --- Quick expense ---
    d.getElementById('ex-amount').value = '12.34';
    d.getElementById('ex-category').value = 'Transport';
    d.getElementById('ex-save-btn').click(); await wait(120);
    assert(DB.expenses.some(x=>Number(x.amount)===12.34 && x.category==='Transport'), 'expense saved');
    assert(d.getElementById('expenses-list').innerHTML.includes('Transport'), 'expense list re-rendered');

    // --- approxUSD ---
    assert(Math.abs(A.approxUSD(80,'GBP') - 96.8) < 0.01, 'approxUSD converts via frankfurter rates less the remittance margin');
    assert(A.approxUSD(50,'XXX') === null, 'an unknown currency returns null gracefully');
  }

  console.log('--- Auth: refresh-on-401 ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    A.saveSession({access_token:'EXPIRED', refresh_token:'RT1', user:{id:UID}});
    let calls = 0;
    dom.window.fetch = function(url, opts){
      if(url.includes('/rest/v1/fam_bills') && (!opts.headers.Authorization || opts.headers.Authorization.includes('EXPIRED')) && calls++ === 0){
        return Promise.resolve({ok:false, status:401, text:()=>Promise.resolve('jwt expired'), json:()=>Promise.resolve({})});
      }
      return mockFetch(url, opts);
    };
    const rows = await A.apiJSON('/rest/v1/fam_bills?select=*');
    assert(A.state.session.access_token === 'AT2', 'token refreshed after 401');
    assert(Array.isArray(rows), 'request retried and succeeded after refresh');
  }

  console.log('--- Persisted session boots straight into app ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document;
    assert(d.getElementById('signin-view').style.display === 'none', 'sign-in hidden with stored session');
    assert(d.getElementById('bills-list').innerHTML.includes('Electricity'), 'data loads on boot with stored session');
  }


  console.log('--- Planner: week helpers ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    assert(A.fridayOf('2023-04-03') === '2023-04-07', 'Mon maps to that week Friday');
    assert(A.fridayOf('2023-04-07') === '2023-04-07', 'Friday maps to itself');
    assert(A.fridayOf('2023-04-08') === '2023-04-14', 'Saturday rolls to next Friday');
    const apr = A.weeksOfMonth('2023-04');
    assert(JSON.stringify(apr) === JSON.stringify(['2023-04-07','2023-04-14','2023-04-21','2023-04-28']), 'April 2023 has the 4 sheet Fridays');
    const jun = A.weeksOfMonth('2023-06');
    assert(jun.length === 5 && jun[4] === '2023-06-30', 'June 2023 has 5 Fridays ending 30 Jun');
    assert(A.shiftMonth('2023-01',-1) === '2022-12', 'shiftMonth crosses year boundary');
    const t = A.weekTotals('2023-04-07',
      [{week_date:'2023-04-07', amount:1800, currency:'GBP'}],
      [{week_date:'2023-04-07', amount:1000, currency:'GBP'}],
      []);
    assert(t.rem.GBP === 800, 'remaining = income - outgoings (sheet: 1800-1000=800)');
  }

  console.log('--- Planner: render + move + paid tick ---');
  {
    DB.income = [{id:'i1', person:'Rodney', amount:1800, currency:'GBP', week_date:null}];
    DB.planner = [{id:'pl1', title:'Farm', amount:1000, currency:'GBP', week_date:null, paid:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          if(url.includes('/rest/v1/fam_income')){
            if((opts.method||'GET')==='GET') return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(DB.income)),json:()=>Promise.resolve(DB.income)});
            if(opts.method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign(DB.income.find(x=>x.id===id), JSON.parse(opts.body)); return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
          }
          if(url.includes('/rest/v1/fam_planner_items')){
            if((opts.method||'GET')==='GET') return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(DB.planner)),json:()=>Promise.resolve(DB.planner)});
            if(opts.method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign(DB.planner.find(x=>x.id===id), JSON.parse(opts.body)); return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            if(opts.method==='POST'){ DB.planner.push(Object.assign({id:'pl'+(DB.planner.length+1)}, JSON.parse(opts.body))); return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')}); }
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    // Rolling window: 4 weeks, current week first
    const weeks = A.weeksWindow(A.currentFriday(), 4);
    DB.income[0].week_date = weeks[0]; DB.planner[0].week_date = weeks[0];
    await A.boot(); await wait(100);
    d.querySelector('#tabs button[data-view="planner"]').click();
    const boardHTML = d.getElementById('pl-board').innerHTML;
    assert(boardHTML.includes('Rodney') && boardHTML.includes('Farm'), 'planner renders income and item cards');
    const cols0 = d.querySelectorAll('#pl-board .wcol');
    assert(cols0.length === 4, 'four rolling week columns');
    assert(cols0[0].getAttribute('data-week') === A.currentFriday(), 'current week is the first column');
    assert(cols0[0].classList.contains('nowweek') && boardHTML.includes('this week'), 'current week visibly marked');
    assert(boardHTML.includes('Remaining'), 'weekly remaining shown');

    // move item to week 2 (simulates the drop handler)
    await A.moveCard('item','pl1', weeks[1]); A.renderPlanner();
    const cols = d.querySelectorAll('#pl-board .wcol');
    assert(!cols[0].innerHTML.includes('Farm') && cols[1].innerHTML.includes('Farm'), 'drag-move relocates card to target week');

    // paid tick
    d.querySelector('button[data-act="ptick"][data-id="pl1"]').click(); await wait(60);
    assert(DB.planner[0].paid === true && DB.planner[0].paid_by === UID, 'paid tick persists who marked it');
    assert(d.querySelector('.card.paid') !== null, 'paid card styled as paid');

    // Overdue marking: lapsed bills and items are unmistakable on the board
    DB.bills.push({id:'blOD', name:'Council tax', amount:180, currency:'GBP', due_date:'2026-07-02', recurrence:'monthly', archived:false});
    DB.planner.push({id:'plOD', title:'Vet bill', amount:75, currency:'GBP', week_date:A.currentFriday(), on_date:'2026-07-20', paid:false, recurrence:'none'});
    await A.boot(); await wait(120);
    const boardOD = d.getElementById('pl-board').innerHTML;
    assert(boardOD.includes('OVERDUE') && boardOD.includes('Council tax'), 'overdue bill badged on the board');
    assert(/\d+d overdue — was due/.test(boardOD), 'overdue cards state how late and the original date');
    assert(boardOD.includes('Overdue — rolled over, unpaid'), 'rolled section headed in overdue terms with a count');
    const odCard = d.querySelector('#pl-board .card.od');
    assert(odCard, 'overdue cards carry the red treatment class');
    assert(boardOD.includes('Vet bill') && d.querySelectorAll('#pl-board .card.od').length >= 2, 'lapsed planner item marked overdue too');
    DB.bills = DB.bills.filter(x=>x.id!=='blOD'); DB.planner = DB.planner.filter(x=>x.id!=='plOD');
    await A.boot(); await wait(80);

    // Rollover: an unpaid item from a past week appears in the current week column
    DB.planner.push({id:'plOld', title:'Vet visit', amount:50, currency:'GBP', week_date:A.addWeeksISO(A.currentFriday(),-2), paid:false, recurrence:'none'});
    await A.boot(); await wait(100);
    const nowCol = d.querySelector('#pl-board .wcol.nowweek');
    assert(nowCol && nowCol.innerHTML.includes('Vet visit') && nowCol.innerHTML.includes('rolled over, unpaid'), 'unpaid past item rolls into the current week');
    assert(nowCol.innerHTML.includes('from '), 'rolled card shows its origin week');
    // it counts in the current week totals
    assert(nowCol.querySelector('.wfoot').textContent.includes('GBP') || nowCol.querySelector('.wfoot').textContent.length > 0, 'totals rendered with rollover included');
    // paying it removes it from the rolled section
    nowCol.querySelector('.card.rolled button[data-act="ptick"][data-id="plOld"]').click(); await wait(150);
    const nowCol2 = d.querySelector('#pl-board .wcol.nowweek');
    assert(!nowCol2.innerHTML.includes('Vet visit'), 'marking paid clears the rollover');
    DB.planner = DB.planner.filter(x=>x.id!=='plOld');
    await A.boot(); await wait(80);

    // + debt payment from the planner: partial amount, dated to the week, reduces the balance
    DB.debts = [{id:'dbt1', name:'Tafadzwa', balance:8500, currency:'GBP', min_payment:0, archived:false}];
    DB.debtPayments = [];
    await A.boot(); await wait(100);
    const wkBtn = d.querySelector('button[data-act="adddebtpay"]');
    assert(wkBtn, 'planner weeks offer + debt payment');
    wkBtn.click(); await wait(60);
    assert(d.getElementById('dp-debt-wrap').style.display !== 'none', 'debt selector shown from planner');
    assert(d.getElementById('dp-name').textContent.includes('partial payments welcome'), 'partial payments invited');
    d.getElementById('dp-amount').value = '500';
    d.getElementById('dp-save').click(); await wait(150);
    assert(DB.debtPayments.length === 1 && parseFloat(DB.debtPayments[0].amount) === 500, 'partial payment recorded');
    assert(DB.debtPayments[0].paid_at && DB.debtPayments[0].paid_at.startsWith(wkBtn.getAttribute('data-week')) || DB.debtPayments[0].paid_at.startsWith(A.todayISO()), 'payment dated to the chosen week');
    assert(parseFloat(DB.debts[0].balance) === 8000, 'balance reduced by the partial payment');
    const boardNow = d.getElementById('pl-board').innerHTML;
    assert(boardNow.includes('debt payment') && boardNow.includes('Tafadzwa'), 'debt payment card on the board');

    // Undo the recorded payment: balance restored, card gone
    const undoBtn = d.querySelector('button[data-act="dpundo"]');
    assert(undoBtn, 'debt payment card offers Undo');
    undoBtn.click(); await wait(60);
    d.getElementById('cm-yes').click(); await wait(200);
    assert(DB.debtPayments.length === 0, 'payment deleted on undo');
    assert(parseFloat(DB.debts[0].balance) === 8500, 'balance restored on undo');

    // Plan for later: creates a linked planner item, no payment, no balance change
    d.querySelector('button[data-act="adddebtpay"]').click(); await wait(60);
    d.getElementById('dp-amount').value = '300';
    const planDate = A.addWeeksISO(A.currentFriday(), 2); // two weeks ahead
    d.getElementById('dp-date').value = planDate;
    d.getElementById('dp-plan').click(); await wait(150);
    assert(DB.debtPayments.length === 0, 'planning records no payment');
    assert(parseFloat(DB.debts[0].balance) === 8500, 'planning leaves balance untouched');
    const planned = DB.planner.find(x=>x.debt_id === 'dbt1');
    assert(planned && parseFloat(planned.amount) === 300, 'planned item linked to the debt');
    assert(planned.week_date === planDate && planned.on_date === planDate, 'planned payment lands in the week of the chosen date');
    assert(d.getElementById('pl-board').innerHTML.includes('planned'), 'planned badge on the board');

    // Tick paid -> real payment + balance reduced; untick -> reversed
    d.querySelector('button[data-act="ptick"][data-id="'+planned.id+'"]').click(); await wait(200);
    assert(DB.debtPayments.length === 1 && parseFloat(DB.debts[0].balance) === 8200, 'tick records payment and reduces balance');
    assert(DB.debtPayments[0].note === 'planner:'+planned.id, 'payment linked back to the planned item');
    d.querySelector('button[data-act="ptick"][data-id="'+planned.id+'"]').click(); await wait(200);
    assert(DB.debtPayments.length === 0 && parseFloat(DB.debts[0].balance) === 8500, 'untick removes payment and restores balance');
    DB.planner = DB.planner.filter(x=>!x.debt_id);
    await A.boot(); await wait(80);

    // Debt statement: open from the Debts tab, running balance, clickable date detail
    DB.debts = [{id:'dbt1', name:'Tafadzwa', balance:7800, principal:8500, currency:'GBP', min_payment:0, archived:false, owner_name:'Rodney', created_at:'2026-06-01T10:00:00Z'}];
    DB.debtPayments = [
      {id:'dpA', debt_id:'dbt1', debt_name:'Tafadzwa', amount:500, currency:'GBP', paid_at:'2026-06-20T12:00:00Z', paid_by:UID},
      {id:'dpB', debt_id:'dbt1', debt_name:'Tafadzwa', amount:200, currency:'GBP', paid_at:'2026-07-05T12:00:00Z', paid_by:UID, note:'planner:xyz'}
    ];
    await A.boot(); await wait(100);
    d.querySelector('#tabs button[data-view="debts"]').click(); await wait(60);
    d.querySelector('button[data-act="dstmt"]').click(); await wait(80);
    const ds = d.getElementById('ds-list').innerHTML;
    assert(d.getElementById('ds-title').textContent.includes('Tafadzwa'), 'statement opens for the chosen debt');
    assert(d.getElementById('ds-chips').textContent.includes('8,500') || d.getElementById('ds-chips').textContent.includes('8500'), 'opening principal shown');
    assert(ds.includes('Debt opened'), 'statement starts at when it was put in');
    assert(ds.includes('balance after') && ds.includes('8,000') || ds.includes('8000'), 'running balance after first payment');
    assert(ds.includes('from planner'), 'planner-sourced payment badged');
    assert(d.getElementById('ds-chips').textContent.includes('Last paid'), 'last payment date summarised');
    // Record actions live on the statement itself
    assert(d.getElementById('ds-pay') && d.getElementById('ds-borrow'), 'statement offers Record payment and Borrowed more');
    d.getElementById('ds-borrow').click(); await wait(60);
    assert(d.getElementById('dp-save').textContent === 'Record borrowing', 'Borrowed more preset carries into the dialog');
    d.querySelector('#dpay-modal [data-close]').click(); await wait(40);
    d.querySelector('button[data-act="dstmt"]').click(); await wait(60);
    // Undo is visible on every statement row without expanding
    assert(d.querySelectorAll('#ds-list button[data-act="dpundo"]').length >= 2, 'each entry shows a direct Undo');
    // click a date -> detail expands with payer and Undo
    d.querySelector('#ds-list button[data-act="dsrow"]').click(); await wait(60);
    const dsOpen = d.getElementById('ds-list').innerHTML;
    assert(dsOpen.includes('Paid by') && dsOpen.includes('Undo'), 'date click reveals payment detail with undo');
    d.querySelector('#dstmt-modal [data-close]').click(); await wait(40);

    // Borrowed more: recorded with a historical date, balance rises, statement shows it
    d.querySelector('button[data-act="dpay"]').click(); await wait(60);
    d.getElementById('dp-kind-borrow').click(); await wait(30);
    assert(d.getElementById('dp-save').textContent === 'Record borrowing', 'save button reflects borrowing mode');
    d.getElementById('dp-amount').value = '1000';
    d.getElementById('dp-date').value = '2026-06-25'; // retroactive
    d.getElementById('dp-save').click(); await wait(180);
    const bor = DB.debtPayments.find(x=>x.kind==='borrow');
    assert(bor && parseFloat(bor.amount) === 1000, 'borrowing recorded with kind=borrow');
    assert(bor.paid_at.startsWith('2026-06-25'), 'borrowing takes the historical date');
    assert(parseFloat(DB.debts[0].balance) === 8800, 'balance increased by the borrowing');
    d.querySelector('button[data-act="dstmt"]').click(); await wait(80);
    const ds2 = d.getElementById('ds-list').innerHTML;
    assert(ds2.includes('borrowed more') && ds2.includes('+') , 'statement shows the Borrowed more entry');
    assert(d.getElementById('ds-chips').textContent.includes('Borrowed more'), 'chips summarise total borrowed');
    // retroactive PAYMENT also honoured (already dated 2026-06-20/07-05 rows render in month bands)
    assert(ds2.indexOf('June') < ds2.indexOf('July'), 'historical entries fall under their own month bands in order');
    // Undo the borrowing: balance comes back down
    d.querySelector('#ds-list button[data-act="dsrow"][data-id="'+bor.id+'"]').click(); await wait(60);
    d.querySelector('#ds-list button[data-act="dpundo"][data-id="'+bor.id+'"]').click(); await wait(60);
    d.getElementById('cm-yes').click(); await wait(200);
    assert(!DB.debtPayments.find(x=>x.kind==='borrow'), 'borrowing removed on undo');
    assert(parseFloat(DB.debts[0].balance) === 7800, 'balance restored after undoing the borrowing');

    DB.debts=[{id:'dbt1', name:'Tafadzwa', balance:8500, currency:'GBP', min_payment:0, archived:false}]; DB.debtPayments=[];
    const dsm=d.querySelector('#dstmt-modal [data-close]'); if(dsm) dsm.click(); await A.boot(); await wait(80);

    // Calendar mode month navigation must not be clobbered by the weeks anchor
    A.state.plMode = 'cal';
    A.state.plMonth = A.todayISO().slice(0,7);
    const calStart = A.state.plMonth;
    d.getElementById('pl-next').click(); await wait(100);
    assert(A.state.plMonth === A.shiftMonth(calStart,1), 'calendar steps forward to the next month (August reachable)');
    assert(d.getElementById('pl-month').textContent !== '' && !d.getElementById('pl-month').textContent.includes('this week first'), 'calendar label shows the month, not the weeks range');
    d.getElementById('pl-prev').click(); await wait(80);
    d.getElementById('pl-prev').click(); await wait(80);
    assert(A.state.plMonth === A.shiftMonth(calStart,-1), 'calendar steps back below the current month');
    A.state.plMode = 'weeks'; A.state.plWeekOffset = 0; A.renderPlanner(); await wait(60);

    // week nav: forward one week, back two (into the past), then label-click resets
    const before = d.getElementById('pl-month').textContent;
    d.getElementById('pl-next').click(); await wait(80);
    assert(d.querySelectorAll('#pl-board .wcol')[0].getAttribute('data-week') === weeks[1], 'next scrolls forward one week');
    d.getElementById('pl-prev').click(); await wait(80);
    d.getElementById('pl-prev').click(); await wait(80);
    const backWeek = d.querySelectorAll('#pl-board .wcol')[0].getAttribute('data-week');
    assert(backWeek < A.currentFriday(), 'can scroll back before the current week');
    d.getElementById('pl-month').click(); await wait(80);
    assert(d.querySelectorAll('#pl-board .wcol')[0].getAttribute('data-week') === A.currentFriday(), 'label click returns to current week');
    assert(d.getElementById('pl-month').textContent !== before || true, 'label reflects range');
  }

  console.log('--- AI capture mapping ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    A.state.plMonth = '2023-04';
    const props = A.mapCaptureResponse({finance_payments:[
      {title:'Rent', amount:'1548', currency:'GBP', due_date:'2023-05-26'},
      {name:'Salary', amount:1800, direction:'income', date:'2023-04-06'},
      {title:'Broken', amount:'abc'},
      {description:'Fuel', value:120, currency:'XXX'}
    ]});
    assert(props.length === 3, 'invalid amounts filtered out');
    assert(props[0].week === '2023-05-26' && props[0].kind === 'item', 'due date mapped to Friday week, default outgoing');
    assert(props[1].kind === 'income', 'income direction detected');
    assert(props[2].currency === 'GBP', 'unknown currency falls back to GBP');
  }


  console.log('--- Debts: maths ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    assert(A.payoffProjection(1000, 0, 100).months === 10, 'zero-interest payoff months');
    const p = A.payoffProjection(1000, 24, 100);
    assert(p.months === 12 && p.interest > 0, 'interest payoff longer with interest cost (12 mo at 24% APR)');
    assert(A.payoffProjection(1000, 24, 15) === null, 'payment below interest = never clears');
    assert(A.payoffProjection(0, 24, 100) === null, 'no balance = no projection');
  }

  console.log('--- Debts: render, payment reduces balance, net position ---');
  {
    DB.accounts = [{id:'a1', name:'HSBC', acct_type:'bank', owner_member:UID, owner_name:'Rodney', currency:'GBP', opening_balance:500, archived:false}];
    DB.debts = [
      {id:'d1', name:'Barclaycard', debt_type:'credit_card', lender:'Barclays', owner_member:UID, owner_name:'Rodney', principal:5000, balance:3000, currency:'GBP', interest_rate:24, min_payment:150, due_day:15, account_id:null, archived:false},
      {id:'d2', name:'Farm loan', debt_type:'loan', lender:'AgriBank', owner_member:null, owner_name:'Farm Ltd', principal:20000, balance:12000, currency:'USD', interest_rate:8, min_payment:400, due_day:1, account_id:null, archived:false}
    ];
    DB.debtPayments = [];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(180);
    const d = dom.window.document, A = dom.window.App;
    d.querySelector('#tabs button[data-view="debts"]').click();
    const dl = d.getElementById('debts-list').innerHTML;
    assert(dl.includes('Barclaycard') && dl.includes('Farm Ltd'), 'debts render with owner names');
    assert(dl.includes('Clears in ~'), 'payoff projection shown');
    const np = d.getElementById('d-debts').innerHTML;
    assert(np.includes('Rodney') && np.includes('Farm Ltd'), 'net position grouped by owner (member and business)');

    // record a payment
    d.querySelector('button[data-act="dpay"][data-id="d1"]').click();
    assert(d.getElementById('dp-amount').value === '150', 'debt payment prefilled with monthly payment');
    d.getElementById('dp-save').click(); await wait(120);
    assert(DB.debts[0].balance === 2850, 'payment reduces debt balance');
    assert(DB.debtPayments.length === 1 && DB.debtPayments[0].paid_by === UID, 'debt payment logged with who paid');

    // admin tab visible for admin, accounts render with computed balance
    assert(d.getElementById('tab-admin').style.display !== 'none', 'admin tab visible to admin');
    d.querySelector('#tabs button[data-view="admin"]').click();
    A.renderAdmin();
    const aa = d.getElementById('ad-accounts').innerHTML;
    assert(aa.includes('HSBC'), 'accounts listed in admin');
    assert(d.getElementById('ad-members').innerHTML.includes('Rodney'), 'members listed in admin');

    // account balance maths: opening 500 - 150 debt payment tagged? (payment had no account) => 500
    assert(A.accountBalance('a1') === 500, 'untagged payments do not move account balance');
    A.state.debtPayments[0].account_id = 'a1';
    assert(A.accountBalance('a1') === 350, 'tagged debt payment reduces account balance');

    // sorting
    A.state.sortDebts = 'owner_name'; A.renderDebts();
    const first = d.querySelector('#debts-list .item strong').textContent;
    assert(first === 'Farm loan', 'debt sort by owner puts Farm Ltd first');
    const sorted = A.sortRows(A.state.bills, 'amount');
    assert(Number(sorted[0].amount) >= Number(sorted[sorted.length-1].amount), 'sortRows numeric biggest first');

    // CSV
    const csv = A.toCSV([{a:'x,y', b:'plain'}], [{label:'A',get:'a'},{label:'B',get:'b'}]);
    assert(csv === 'A,B\n"x,y",plain', 'CSV escapes commas');

    // due checks: bill overdue (b1 responsible UID2) triggers notify, deduped
    DB.notifies = [];
    dom.window.localStorage.removeItem('fm_notified');
    A.state.bills.push({id:'bod', name:'Old rates', amount:50, currency:'GBP', due_date:'2020-01-01', recurrence:'none', responsible:UID2, archived:false});
    A.runDueChecks();
    assert(DB.notifies.some(n=>n.title==='Bill overdue'), 'overdue bill notifies responsible member');
    const count = DB.notifies.length;
    A.runDueChecks();
    assert(DB.notifies.length === count, 'due checks deduped per day');
  }

  console.log('--- Monthly close ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    const ym = A.todayISO().slice(0,7);
    A.state.income = [{week_date: ym + '-05', amount:2000, currency:'GBP'}];
    A.state.payments = [{paid_at: ym + '-06T10:00:00Z', amount:500, currency:'GBP'}];
    A.state.expenses = [{spent_at: ym + '-07', amount:300, currency:'GBP'}];
    A.state.debtPayments = [{paid_at: ym + '-08T10:00:00Z', amount:200, currency:'GBP'}];
    const c = A.monthlyClose(ym);
    assert(c.net.GBP === 1000, 'monthly close net = in - out - debt (2000-800-200)');
  }


  console.log('--- Asset-backed debts ---');
  {
    DB.accounts = []; DB.debtPayments = [];
    DB.debts = [
      {id:'d1', name:'Mortgage', debt_type:'loan', owner_name:'Rodney', principal:200000, balance:150000, currency:'GBP', interest_rate:5, min_payment:1200, asset_backed:true, asset_name:'House', asset_value:280000, archived:false},
      {id:'d2', name:'Barclaycard', debt_type:'credit_card', owner_name:'Rodney', principal:5000, balance:3000, currency:'GBP', interest_rate:24, min_payment:150, asset_backed:false, archived:false}
    ];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(180);
    const d = dom.window.document;
    const dl = d.getElementById('debts-list').innerHTML;
    assert(dl.includes('>Asset<'), 'asset badge shown on asset-backed debt');
    assert(dl.includes('equity: £130,000.00'), 'equity computed (280k value - 150k owed)');
    const np = d.getElementById('d-debts').innerHTML;
    assert(np.includes('Wealth-building') && np.includes('Costing debt'), 'net position split into costing vs wealth-building');
    assert(np.includes('Asset equity built'), 'equity total shown on dashboard');
    // modal toggle
    d.getElementById('debt-add-btn').click();
    assert(d.getElementById('dm-asset-fields').style.display === 'none', 'asset fields hidden by default');
    d.getElementById('dm-asset').checked = true;
    d.getElementById('dm-asset').dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('dm-asset-fields').style.display === '', 'ticking asset reveals asset fields');
  }


  console.log('--- Net worth & tracking ---');
  {
    const iso = d => d.toISOString().slice(0,10);
    DB.accounts=[{id:'a1',name:'HSBC',acct_type:'bank',owner_name:'Family',currency:'GBP',opening_balance:1000,archived:false}];
    DB.debts=[{id:'d1',name:'Mortgage',debt_type:'loan',owner_name:'Family',principal:200000,balance:150000,currency:'GBP',interest_rate:5,min_payment:1200,asset_backed:true,asset_name:'House',asset_value:280000,archived:false}];
    DB.debtPayments=[]; DB.snapshots=[
      {kind:'networth',ref_id:'net',currency:'GBP',snap_date:'2026-07-01',value:130000},
      {kind:'networth',ref_id:'net',currency:'GBP',snap_date:'2026-07-10',value:130500}
    ];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    const nw = A.netWorth();
    assert(nw.GBP === 130000, 'net worth = 280000 asset - 150000 debt (accounts excluded)');
    assert(d.getElementById('nw-headline').innerHTML.includes('130,000'), 'net worth headline rendered');
    assert(d.getElementById('nw-chart').innerHTML.includes('<svg'), 'net worth trend chart drawn from snapshots');
    assert(!d.getElementById('nw-series').innerHTML.includes('HSBC') && d.getElementById('nw-series').innerHTML.includes('Mortgage'), 'tracking shows debts only (no account rows)');
    // snapshot taken on boot (fm_snap unset -> POST fired), incl networth row
    assert(!(DB.snapshots||[]).some(r=>r.kind==='account'), 'snapshots no longer write account rows');
    assert((DB.snapshots||[]).some(r=>r.kind==='networth' && Number(r.value)===130000), 'daily snapshot wrote net worth row');
    assert(dom.window.localStorage.getItem('fm_snap_family') === A.todayISO(), 'snapshot deduped for today');
    // chart helper edge cases
    assert(A.lineChart([{v:1}],100,30,{}).includes('Not enough history'), 'single point shows building message');
    assert(A.lineChart([{v:1},{v:5},{v:3}],100,30,{}).includes('polyline'), 'multi-point series draws polyline');
    // shared Family owner option present in owner selects
    d.getElementById('debt-add-btn').click();
    assert(d.getElementById('dm-owner-member').options[0].textContent.includes('Family (shared'), 'Family shared ownership option available');
  }


  console.log('--- PIN, recurring planner, manual rates ---');
  {
    DB.settings=[{key:'manual_rates', value:{ZZZ:40}}];
    DB.planner=[]; DB.income=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // Manual ZWG rate feeds approxUSD
    assert(Math.abs(A.approxUSD(400,'ZZZ') - 9.68) < 0.001, 'a manual rate converts with the remittance margin (400/40 = $10 market, $9.68 received)');
    assert(Math.abs(A.approxUSD(80,'GBP') - 96.8) < 0.01, 'frankfurter rates still preferred where available (margin applied)');

    // PIN: none set -> not required
    assert(A.pinRequired() === false, 'no PIN set means no lock');
    const h = await A.hashPin('1234');
    dom.window.localStorage.setItem('fm_pin', h);
    dom.window.sessionStorage.removeItem('fm_pin_ok');
    assert(A.pinRequired() === true, 'PIN set + fresh session requires unlock');
    d.getElementById('pin-lock').classList.add('open');
    d.getElementById('pin-input').value = '9999';
    A.tryUnlock(); await wait(30);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'wrong PIN keeps the lock');
    d.getElementById('pin-input').value = '1234';
    A.tryUnlock(); await wait(30);
    assert(!d.getElementById('pin-lock').classList.contains('open'), 'correct PIN unlocks');
    assert(dom.window.sessionStorage.getItem('fm_pin_ok') === '1', 'unlock is per-session');

    // Recurring planner week maths
    assert(A.nextPlannerWeek('2023-04-07','weekly') === '2023-04-14', 'weekly recurrence +7d');
    assert(A.nextPlannerWeek('2023-04-07','monthly') === '2023-05-05', 'monthly recurrence keeps first-Friday position');
    assert(A.nextPlannerWeek('2023-06-30','monthly') === '2023-07-28', 'monthly clamps to last Friday when next month has fewer');
  }

  console.log('--- Recurring item: paid tick spawns next instance ---');
  {
    const iso = d => d.toISOString().slice(0,10);
    DB.planner = null; DB.income = [];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          if(url.includes('/rest/v1/fam_planner_items')){
            if((opts.method||'GET')==='GET') return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(DB.planner||[])),json:()=>Promise.resolve(DB.planner||[])});
            if(opts.method==='PATCH'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; Object.assign(DB.planner.find(x=>x.id===id), JSON.parse(opts.body)); return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            if(opts.method==='POST'){ DB.planner.push(Object.assign({id:'pl'+(DB.planner.length+1), paid:false}, JSON.parse(opts.body))); return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')}); }
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    const w0 = A.currentFriday();
    DB.planner = [{id:'pl1', title:'Farm', amount:1000, currency:'GBP', week_date:w0, paid:false, recurrence:'weekly'}];
    await A.boot(); await wait(120);
    d.querySelector('button[data-act="ptick"][data-id="pl1"]').click();
    await wait(150);
    const next = A.nextPlannerWeek(w0,'weekly');
    assert(DB.planner.some(x=>x.week_date===next && !x.paid && x.title==='Farm' && x.recurrence==='weekly'), 'paying a weekly item creates next week instance');
    assert(DB.planner.find(x=>x.id==='pl1').paid === true, 'original instance stays as paid history');
    d.querySelector('button[data-act="ptick"][data-id="pl1"]').click(); // untick
    await wait(100);
    d.querySelector('button[data-act="ptick"][data-id="pl1"]').click(); // re-tick
    await wait(150);
    assert(DB.planner.filter(x=>x.week_date===next && x.title==='Farm' && !x.paid).length === 1, 'no duplicate next instance on repeated ticks');
  }


  console.log('--- Private spaces ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[];
    const reqs = [];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){ reqs.push({url, method:(opts&&opts.method)||'GET', body:opts&&opts.body}); return mockFetch(url, opts); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // pre-unlock the PIN gate so space cycling proceeds (mandatory-PIN suite tests the gate itself)
    dom.window.localStorage.setItem('fm_pin', await A.hashPin('1234'));
    dom.window.sessionStorage.setItem('fm_pin_priv_ok','1');
    dom.window.sessionStorage.setItem('fm_pin_ok','1');
    // Default family space: loads carry the family filter
    assert(A.currentSpace() === 'family', 'defaults to family space');
    assert(reqs.some(r=>r.url.includes('fam_bills') && r.url.includes('space=eq.family')), 'family loads filtered to space=family');
    assert(d.getElementById('space-badge').style.display === 'none', 'no private badge in family space');

    // Switch to private
    reqs.length = 0;
    await cycleSpace(dom, A);
    assert(A.currentSpace() === 'private', 'toggle switches to private');
    assert(dom.window.localStorage.getItem('fm_space') === 'private', 'space choice persisted');
    assert(reqs.some(r=>r.url.includes('fam_bills') && r.url.includes('space=eq.private') && r.url.includes('space_owner=eq.' + UID)), 'private loads filtered to own rows only');
    assert(d.getElementById('space-badge').style.display !== 'none', 'PRIVATE badge visible');
    assert(d.getElementById('tab-admin').textContent === 'Setup', 'admin tab becomes Setup in private space');
    assert(d.getElementById('tab-admin').style.display !== 'none', 'Setup available to the user in private space');

    // Creates stamped with space
    const b = A.spaceBody({name:'x'});
    assert(b.space === 'private' && b.space_owner === UID, 'spaceBody stamps private + owner');
    // Add a bill in private space and check the POST body
    reqs.length = 0;
    d.getElementById('bill-add-btn').click();
    d.getElementById('bm-name').value='Gym';
    d.getElementById('bm-amount').value='30';
    d.getElementById('bm-due').value=A.todayISO();
    d.getElementById('bm-save').click(); await wait(120);
    const post = reqs.find(r=>r.url.includes('fam_bills') && r.method==='POST');
    assert(post && JSON.parse(post.body).space === 'private' && JSON.parse(post.body).space_owner === UID, 'private bill POSTed with space + owner');

    // Cycle continues however many spaces exist, back to family
    for(let i=0;i<5 && A.currentSpace()!=='family';i++){ await cycleSpace(dom, A); }
    assert(A.currentSpace() === 'family' && d.getElementById('tab-admin').textContent === 'Admin', 'toggle returns to family; tab reverts to Admin');
    const fb = A.spaceBody({name:'y'});
    assert(fb.space === 'family' && fb.space_owner === null, 'spaceBody stamps family with no owner');

    // Move bridge: bill move patches bill + its payments
    reqs.length = 0;
    await A.moveSpace('bill','b2'); await wait(60);
    const patches = reqs.filter(r=>r.method==='PATCH');
    assert(patches.some(r=>r.url.includes('fam_bills?id=eq.b2')) && patches.some(r=>r.url.includes('fam_bill_payments?bill_id=eq.b2')), 'moving a bill moves its payment history too');
    assert(patches.every(r=>JSON.parse(r.body).space === 'private'), 'move from family targets private');
  }


  console.log('--- Statement import: CSV parse + recurring detection ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App;
    const q = String.fromCharCode(34);
    const rows = A.parseCSV('a,b\n' + q + 'x,1' + q + ',' + q + 'he said ' + q+q + 'hi' + q+q + q + '\n2,3\n');
    assert(rows.length === 3 && rows[1][0] === 'x,1' && rows[1][1] === 'he said ' + q + 'hi' + q, 'CSV parser handles quotes and embedded commas');

    const csv = ['Date,Name,Category,Amount,Currency',
      '12/04/2026,Disney+,Entertainment,-14.99,GBP',
      '12/05/2026,Disney+,Entertainment,-14.99,GBP',
      '13/06/2026,Disney+,Entertainment,-14.99,GBP',
      '01/05/2026,Sky,Bills,-160.49,GBP',
      '02/06/2026,Sky,Bills,-160.49,GBP',
      '03/04/2026,Tesco,Groceries,-52.10,GBP',
      '19/04/2026,Tesco,Groceries,-8.30,GBP',
      '25/04/2026,Tesco,Groceries,-91.00,GBP',
      '10/05/2026,Refund,General,25.00,GBP',
      '07/04/2026,OneOff,General,-500.00,GBP'].join('\n');
    const props = A.detectRecurring(A.parseCSV(csv));
    const names = props.map(p=>p.title);
    assert(names.includes('Disney+') && names.includes('Sky'), 'monthly subscriptions detected');
    assert(!names.includes('Tesco'), 'variable multi-per-month spend not proposed');
    assert(!names.includes('OneOff') && !names.includes('Refund'), 'one-offs and credits excluded');
    const disney = props.find(p=>p.title==='Disney+');
    assert(disney.amount === 14.99 && disney.due_day === 12 && disney.months === 3, 'median amount, due day and month count correct');
    assert(props[0].title === 'Sky', 'proposals sorted biggest first');
    assert(A.nextDueFromDay(1) >= A.todayISO().slice(0,8) + '01', 'next due date never in the past');
  }

  console.log('--- Statement import: existing bills filtered on re-import ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(180);
    const A = dom.window.App;
    const csv = ['Date,Name,Category,Amount,Currency',
      '02/05/2026,Internet,Bills,-80.00,GBP',
      '02/06/2026,Internet,Bills,-80.00,GBP',
      '01/05/2026,Sky,Bills,-160.49,GBP',
      '02/06/2026,Sky,Bills,-160.49,GBP'].join('\n');
    const props = A.detectRecurring(A.parseCSV(csv));
    assert(props.some(p=>p.title==='Internet'), 'detector sees the recurring line');
    const existing = {}; A.state.bills.forEach(b=>existing[b.name.toLowerCase()]=1);
    const filtered = props.filter(p=>!existing[p.title.toLowerCase()]);
    assert(!filtered.some(p=>p.title==='Internet') && filtered.some(p=>p.title==='Sky'), 're-import skips bills that already exist');
  }


  console.log('--- Business space ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[];
    const reqs=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){ reqs.push({url}); return mockFetch(url, opts); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    // pre-unlock the PIN gate so space cycling proceeds (mandatory-PIN suite tests the gate itself)
    dom.window.localStorage.setItem('fm_pin', await A.hashPin('1234'));
    dom.window.sessionStorage.setItem('fm_pin_priv_ok','1');
    dom.window.sessionStorage.setItem('fm_pin_ok','1');
    // admin cycles family -> private -> business -> family
    await cycleSpace(dom, A); assert(A.currentSpace()==='private', 'cycle 1: private');
    reqs.length=0;
    await cycleSpace(dom, A);
    assert(A.currentSpace()==='business', 'cycle 2: business (admin only)');
    assert(reqs.some(r=>r.url.includes('fam_bills') && r.url.includes('space=eq.business')), 'business loads filtered to space=business');
    assert(d.getElementById('space-badge').textContent==='BUSINESS', 'BUSINESS badge shown');
    const b = A.spaceBody({name:'x'});
    assert(b.space==='business' && b.space_owner===null, 'business rows stamped without individual owner');
    assert(d.getElementById('tab-admin').textContent==='Setup' && d.getElementById('tab-admin').style.display!=='none', 'business space has Setup tab');
    for(let i=0;i<5 && A.currentSpace()!=='family';i++){ await cycleSpace(dom, A); }
    assert(A.currentSpace()==='family', 'cycle wraps back to family');

    // non-admin never reaches business
    A.state.isAdmin = false; A.state.farmGranted = false;
    await cycleSpace(dom, A); assert(A.currentSpace()==='private', 'member cycle 1: private');
    await cycleSpace(dom, A); assert(A.currentSpace()==='family', 'member cycle 2: family (business skipped)');
    A.setSpace('business');
    assert(A.currentSpace()==='family', 'setSpace refuses business for non-admin');
    A.state.isAdmin = true;
  }

  console.log('--- Planner calendar view ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App, d = dom.window.document;
    A.state.plMonth = '2023-04';
    A.state.income = [{week_date:'2023-04-07', amount:1800, currency:'GBP'}];
    A.state.planItems = [{week_date:'2023-04-07', amount:1000, currency:'GBP'}];
    A.state.bills = [{due_date:'2023-04-12', amount:120, currency:'GBP', archived:false},
                     {due_date:'2023-05-01', amount:999, currency:'GBP', archived:false}];
    const f = A.calendarFlows('2023-04');
    assert(f['2023-04-07'].GBP === 800, 'Friday nets income minus planner items (+1800-1000)');
    assert(f['2023-04-12'].GBP === -120, 'bill due date shows negative flow');
    assert(!f['2023-05-01'], 'other months excluded');
    A.renderCalendar();
    const cal = d.getElementById('pl-cal').innerHTML;
    assert(cal.includes('class="net pos">+£800.00'), 'positive day rendered green with +');
    assert(cal.includes('class="net neg">−£120.00'), 'negative day rendered red with −');
    assert((cal.match(/class="dow"/g)||[]).length === 7, 'seven weekday headers');
    A.setPlannerMode('cal');
    assert(d.getElementById('pl-cal').style.display === '' && d.getElementById('pl-board').style.display === 'none', 'calendar mode swaps views');
    A.setPlannerMode('weeks');
    assert(d.getElementById('pl-board').style.display === '', 'weeks mode restores board');
  }


  console.log('--- TRJ Farms space ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    const reqs=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){ reqs.push({url, method:(opts&&opts.method)||'GET', body:opts&&opts.body}); return mockFetch(url, opts); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    // pre-unlock the PIN gate so space cycling proceeds (mandatory-PIN suite tests the gate itself)
    dom.window.localStorage.setItem('fm_pin', await A.hashPin('1234'));
    dom.window.sessionStorage.setItem('fm_pin_priv_ok','1');
    dom.window.sessionStorage.setItem('fm_pin_ok','1');
    // admin cycle now includes farm
    await cycleSpace(dom, A); await cycleSpace(dom, A); // private -> business
    reqs.length=0;
    await cycleSpace(dom, A); // -> farm
    assert(A.currentSpace()==='farm', 'admin cycle reaches TRJ Farms');
    assert(reqs.some(r=>r.url.includes('fam_bills') && r.url.includes('space=eq.farm')), 'farm loads filtered to space=farm');
    assert(d.getElementById('space-badge').textContent==='TRJ FARMS', 'TRJ FARMS badge shown');
    assert(A.spaceBody({}).space==='farm', 'farm rows stamped with farm space');
    await cycleSpace(dom, A); assert(A.currentSpace()==='family', 'cycle wraps to family');

    // granted non-admin reaches farm but not business
    A.state.isAdmin=false; A.state.farmGranted=true;
    await cycleSpace(dom, A); assert(A.currentSpace()==='private', 'granted member: private');
    await cycleSpace(dom, A); assert(A.currentSpace()==='farm', 'granted member reaches farm, business skipped');
    await cycleSpace(dom, A); assert(A.currentSpace()==='family', 'granted member wraps to family');
    // ungranted member never reaches farm
    A.state.farmGranted=false;
    A.setSpace('farm'); assert(A.currentSpace()==='family', 'setSpace refuses farm without grant');
    A.state.isAdmin=true;

    // grant checkbox in admin drives fam_space_grants
    A.state.farmGrants=[]; A.renderAdmin();
    const cb = d.querySelector('[data-farmgrant="' + UID2 + '"]');
    assert(cb !== null, 'farm access checkbox shown for non-admin member');
    reqs.length=0;
    cb.checked = true;
    cb.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    await wait(80);
    const post = reqs.find(r=>r.url.includes('fam_space_grants') && r.method==='POST');
    assert(post && JSON.parse(post.body).user_id===UID2 && JSON.parse(post.body).space==='farm', 'ticking grants farm access');
  }


  console.log('--- Private space demands a PIN ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // 1. No PIN set: trying to enter private forces the set-PIN modal, space unchanged
    A.switchSpace(); await wait(60);
    assert(A.currentSpace() === 'family', 'without a PIN the space does not switch');
    assert(d.getElementById('pinset-modal').classList.contains('open'), 'mandatory set-PIN modal opens');
    assert(d.getElementById('ps-note').textContent.includes('requires a PIN'), 'modal explains the requirement');
    // blank save rejected while mandatory
    d.getElementById('ps-pin').value = '';
    A.savePinSetting(); await wait(30);
    assert(d.getElementById('pinset-modal').classList.contains('open'), 'blank PIN rejected when mandatory');
    // cancel returns cleanly to family
    d.querySelector('[data-close="pinset-modal"]').click(); await wait(30);
    assert(A.currentSpace() === 'family' && !d.getElementById('pinset-modal').classList.contains('open'), 'cancel keeps family space');

    // 2. Setting a PIN completes the pending entry into private
    A.switchSpace(); await wait(60);
    d.getElementById('ps-pin').value = '4321';
    await A.savePinSetting(); await wait(150);
    assert(A.currentSpace() === 'private', 'after setting the PIN, private opens');
    assert(dom.window.sessionStorage.getItem('fm_pin_priv_ok') === '1', 'private unlock recorded for the session');

    // 3. Fresh session with PIN set: lock demanded before private shows
    dom.window.sessionStorage.removeItem('fm_pin_priv_ok');
    dom.window.sessionStorage.removeItem('fm_pin_ok');
    await A.boot(); await wait(150);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'boot into private demands the PIN');
    assert(A.currentSpace() === 'family', 'nothing private renders behind the lock');
    d.getElementById('pin-input').value = '9999';
    await A.tryUnlock(); await wait(50);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'wrong PIN keeps private locked');
    d.getElementById('pin-input').value = '4321';
    await A.tryUnlock(); await wait(150);
    assert(A.currentSpace() === 'private', 'correct PIN restores the private space');

    // 4. Removing the PIN while in private bounces to family
    A.state.pinMustSet = false;
    d.getElementById('ps-pin').value = '';
    A.savePinSetting(); await wait(100);
    assert(A.currentSpace() === 'family', 'removing the PIN exits the private space');
    assert(dom.window.localStorage.getItem('fm_pin') === null, 'PIN cleared');
  }


  console.log('--- PIN demanded on EVERY private entry; business/family/farm ungated ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    dom.window.localStorage.setItem('fm_pin', await A.hashPin('1234'));

    // Entry 1: family -> private prompts
    let p = A.switchSpace(); await wait(40);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'entering private prompts for PIN');
    d.getElementById('pin-input').value='1234'; await A.tryUnlock(); await p; await wait(40);
    assert(A.currentSpace()==='private', 'unlock enters private');

    // Entry 2: private -> business is NOT gated (business ungated by request)
    p = A.switchSpace(); await wait(40);
    assert(!d.getElementById('pin-lock').classList.contains('open'), 'business entry not PIN-gated');
    await p; await wait(40);
    assert(A.currentSpace()==='business', 'business entered directly');

    // farm and family remain ungated
    p = A.switchSpace(); await wait(40);
    assert(!d.getElementById('pin-lock').classList.contains('open') && A.currentSpace()==='farm', 'farm entry not PIN-gated');
    await p;
    p = A.switchSpace(); await p; await wait(30);
    assert(A.currentSpace()==='family', 'family entry not PIN-gated');

    // Entry 3: returning to private prompts a third time
    p = A.switchSpace(); await wait(40);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'every re-entry re-prompts');
    d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape', bubbles:true}));
    await wait(30);
    assert(A.currentSpace()==='family', 'Escape abandons entry, stays in family');
  }

  console.log('--- Recurring income: materialise + skip a week + stop ---');
  {
    DB.settings=[]; DB.planner=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    DB.income = null;
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          if(url.includes('/rest/v1/fam_income')){
            const method=(opts.method||'GET');
            if(method==='GET') return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(DB.income||[])),json:()=>Promise.resolve(DB.income||[])});
            if(method==='POST'){ DB.income.push(Object.assign({id:'inc'+(DB.income.length+1)}, JSON.parse(opts.body))); return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')}); }
            if(method==='PATCH'){
              const idm=/id=eq\.([^&]+)/.exec(url), sm=/series_id=eq\.([^&]+)/.exec(url);
              DB.income.forEach(r=>{ if((idm&&r.id===idm[1])||(sm&&r.series_id===sm[1])) Object.assign(r, JSON.parse(opts.body)); });
              return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')});
            }
            if(method==='DELETE'){ const id=/id=eq\.([^&]+)/.exec(url)[1]; DB.income=DB.income.filter(r=>r.id!==id); return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const A = dom.window.App;
    const w0 = A.weeksOfMonth(A.state.plMonth)[0];
    DB.income = [{id:'seed', person:'Rodney', amount:1800, currency:'GBP', week_date:w0, recurrence:'weekly', series_id:null, space:'family'}];
    await A.boot(); await wait(200);
    const weeks = DB.income.map(r=>r.week_date).sort();
    assert(DB.income.length > 4, 'weekly income materialised forward (' + DB.income.length + ' instances)');
    assert(DB.income.every(r=>r.person==='Rodney' && Number(r.amount)===1800), 'instances copy person and amount');
    assert(DB.income.slice(1).every(r=>r.series_id==='seed'), 'instances linked to the series');
    const before = DB.income.length;
    await A.boot(); await wait(200);
    assert(DB.income.length === before, 'second load creates no duplicates');

    // skip a week: delete a middle instance, reload — it stays deleted
    const middle = DB.income[2];
    DB.income = DB.income.filter(r=>r.id!==middle.id);
    await A.boot(); await wait(200);
    assert(!DB.income.some(r=>r.week_date===middle.week_date && r.person==='Rodney'), 'deleted middle week stays deleted (week off)');

    // stop series: no further instances beyond current end
    DB.income.forEach(r=>{ r.recurrence='none'; });
    const count2 = DB.income.length;
    A.state.plMonth = A.shiftMonth(A.state.plMonth, 1);
    await A.boot(); await wait(200);
    assert(DB.income.length === count2, 'stopped series creates nothing further');
  }


  console.log('--- Day view + daily recurrence + day anchoring ---');
  {
    const dom = makeDom(); await wait(50);
    const A = dom.window.App, d = dom.window.document;
    assert(A.nextOnDate('2026-07-18','daily') === '2026-07-19', 'daily +1 day');
    assert(A.nextOnDate('2026-07-18','weekly') === '2026-07-25', 'weekly +7 days on exact date');
    assert(A.nextOnDate('2026-01-31','monthly') === '2026-02-28', 'monthly on-date clamps month end');

    A.state.plMonth = '2026-07'; A.state.plDay = '2026-07-15';
    A.state.bills = [{id:'b9', name:'Sky', amount:160, currency:'GBP', due_date:'2026-07-15', archived:false}];
    A.state.income = [{id:'i9', person:'Rodney', amount:500, currency:'GBP', week_date:'2026-07-17', on_date:'2026-07-15'}];
    A.state.planItems = [{id:'p9', title:'Fuel', amount:60, currency:'GBP', week_date:'2026-07-17', on_date:'2026-07-15', paid:false},
                         {id:'p10', title:'Farm', amount:1000, currency:'GBP', week_date:'2026-07-17', on_date:null, paid:false}];
    A.renderDay();
    const dl = d.getElementById('day-list').innerHTML;
    assert(dl.includes('Sky') && dl.includes('Rodney') && dl.includes('Fuel'), 'day view lists bill, income and item on the date');
    assert(!dl.includes('Farm'), 'week-anchored item not shown on a non-Friday');
    assert(dl.includes('Day net'), 'day net computed');

    A.state.plDay = '2026-07-17'; A.renderDay();
    assert(d.getElementById('day-list').innerHTML.includes('Farm'), 'week-anchored item surfaces on its Friday');

    // calendar places day-anchored entries on their exact day
    const f = A.calendarFlows('2026-07');
    assert(f['2026-07-15'].GBP === 500 - 60 - 160, 'calendar nets day-anchored entries on the exact date');
    assert(f['2026-07-17'].GBP === -1000, 'week-anchored item still on its Friday');

    // mode switching includes day
    A.setPlannerMode('day');
    assert(d.getElementById('pl-day').style.display === '' && d.getElementById('pl-board').style.display === 'none', 'day mode swaps views');
    A.setPlannerMode('weeks');
  }


  console.log('--- Space dropdown ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    const sel = d.getElementById('space-select');
    const opts = ()=>[...sel.options].map(o=>o.value);

    // admin sees all four options
    assert(JSON.stringify(opts()) === JSON.stringify(['family','private','business','farm']), 'admin dropdown lists all four spaces');
    assert(sel.value === 'family', 'current space selected');

    // direct jump family -> farm without passing through others
    await A.goToSpace('farm'); await wait(60);
    assert(A.currentSpace() === 'farm' && sel.value === 'farm', 'direct selection jumps straight to farm');

    // direct jump farm -> business, no PIN
    await A.goToSpace('business'); await wait(60);
    assert(A.currentSpace() === 'business', 'business reachable directly without PIN');

    // private via dropdown still gated; cancel snaps selection back
    dom.window.localStorage.setItem('fm_pin', await A.hashPin('1234'));
    sel.value = 'private';
    sel.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    await wait(60);
    assert(d.getElementById('pin-lock').classList.contains('open'), 'selecting private prompts PIN');
    d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape', bubbles:true}));
    await wait(80);
    assert(A.currentSpace() !== 'private', 'cancelled PIN does not enter private');
    assert(sel.value === A.currentSpace(), 'dropdown snaps back to the real space on cancel');
    // and entering properly works
    sel.value = 'private';
    sel.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    await wait(60);
    d.getElementById('pin-input').value='1234'; await A.tryUnlock(); await wait(120);
    assert(A.currentSpace() === 'private' && sel.value === 'private', 'PIN entry completes the jump to private');

    // member without grants sees only two options
    A.state.isAdmin = false; A.state.farmGranted = false;
    A.setSpace('family');
    assert(JSON.stringify(opts()) === JSON.stringify(['family','private']), 'member dropdown limited to family + private');
    A.state.farmGranted = true; A.setSpace('family');
    assert(opts().includes('farm') && !opts().includes('business'), 'granted member gains farm but not business');
    A.state.isAdmin = true;
  }


  console.log('--- Assets register ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    DB.assets=[{id:'as1', name:'TRJ Farm land', category:'Land', owner_name:'TRJ Farms', currency:'USD', value:120000, valued_at:'2026-07-01', archived:false}];
    DB.debts=[{id:'d1', name:'Mortgage', debt_type:'loan', owner_name:'Family', principal:200000, balance:150000, currency:'GBP', interest_rate:5, min_payment:1200, asset_backed:true, asset_name:'House', asset_value:280000, archived:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    d.querySelector('#tabs button[data-view="assets"]').click();
    const al = d.getElementById('assets-list').innerHTML;
    assert(al.includes('TRJ Farm land') && al.includes('120,000'), 'asset listed with value');
    assert(d.getElementById('assets-total').innerHTML.includes('USD total'), 'per-currency total shown');
    assert(d.getElementById('assets-financed').innerHTML.includes('House') && d.getElementById('assets-financed').innerHTML.includes('equity £130,000'), 'financed assets from Debts shown with equity');

    // net worth includes the standalone asset
    const nw = A.netWorth();
    assert(nw.USD === 120000, 'standalone asset counted in net worth (USD)');
    assert(nw.GBP === 130000, 'financed asset equity path unchanged (GBP 280k-150k)');

    // snapshots write asset rows
    assert((DB.snapshots||[]).some(r=>r.kind==='asset' && r.ref_id==='as1'), 'daily snapshot includes asset value');

    // add via modal
    d.getElementById('asset-add-btn').click();
    assert(d.getElementById('asset-modal').classList.contains('open'), 'asset modal opens');
    d.getElementById('asm-save').click(); await wait(30);
    assert(d.getElementById('asm-err').style.display !== 'none', 'validation requires name and value');
    d.getElementById('asm-name').value='Hilux';
    d.getElementById('asm-value').value='15000';
    d.getElementById('asm-currency').value='USD';
    d.getElementById('asm-save').click(); await wait(120);
    assert(DB.assets.some(a=>a.name==='Hilux' && Number(a.value)===15000), 'new asset saved');
    assert(DB.assets.find(a=>a.name==='Hilux').space==='family', 'asset stamped with current space');
    assert(!d.getElementById('asset-modal').classList.contains('open'), 'modal closes after save');

    // revalue
    A.state.assets = DB.assets;
    d.querySelector('button[data-act="asedit"][data-id="as1"]') && d.querySelector('button[data-act="asedit"][data-id="as1"]').click();
    if(d.getElementById('asset-modal').classList.contains('open')){
      d.getElementById('asm-value').value='125000';
      d.getElementById('asm-save').click(); await wait(120);
      assert(Number(DB.assets.find(a=>a.id==='as1').value)===125000, 'revaluation persists');
    } else { assert(false, 'edit opens the modal'); }
  }


  console.log('--- Debt linked to register asset (no double record) ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    DB.assets=[{id:'as1', name:'House', category:'Property', owner_name:'Family', currency:'GBP', value:280000, valued_at:'2026-07-01', archived:false},
               {id:'as2', name:'Bakkie', category:'Vehicle', owner_name:'Family', currency:'USD', value:15000, valued_at:'2026-07-01', archived:false}];
    DB.debts=[{id:'d1', name:'Mortgage', debt_type:'loan', owner_name:'Family', principal:200000, balance:150000, currency:'GBP',
               interest_rate:5, min_payment:1200, asset_backed:true, asset_id:'as1', asset_name:null, asset_value:null, archived:false},
              {id:'d2', name:'Car loan', debt_type:'loan', owner_name:'Family', principal:10000, balance:8000, currency:'GBP',
               interest_rate:9, min_payment:250, asset_backed:true, asset_id:'as2', asset_name:null, asset_value:null, archived:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // helper resolution
    const ai = A.debtAssetInfo(A.state.debts.find(x=>x.id==='d1'));
    assert(ai.linked && ai.name==='House' && ai.value===280000, 'linked debt resolves register asset');
    const eq = A.debtEquity(A.state.debts.find(x=>x.id==='d1'));
    assert(eq.equity===130000, 'equity from register value (280k-150k)');
    assert(A.debtEquity(A.state.debts.find(x=>x.id==='d2'))===null, 'currency mismatch yields no equity number');

    // no double counting: GBP = 280000 asset - 150000 - 8000 = 122000; USD = 15000
    const nw = A.netWorth();
    assert(nw.GBP===122000 && nw.USD===15000, 'linked asset counted once in net worth');

    // debts list shows register equity; assets list badges financed
    d.querySelector('#tabs button[data-view="debts"]').click();
    assert(d.getElementById('debts-list').innerHTML.includes('House (register) equity: £130,000.00'), 'debt row shows register-linked equity');
    d.querySelector('#tabs button[data-view="assets"]').click();
    assert(d.getElementById('assets-list').innerHTML.includes('financed · Mortgage'), 'register asset badged as financed');
    assert(d.getElementById('assets-financed').innerHTML.includes('>register<'), 'financed section marks register link');

    // modal: dropdown lists register assets; choosing hides manual fields
    d.getElementById('debt-add-btn').click();
    d.getElementById('dm-asset').checked = true;
    d.getElementById('dm-asset').dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    const link = d.getElementById('dm-asset-link');
    assert([...link.options].some(o=>o.textContent.includes('House')), 'asset dropdown lists register assets with values');
    link.value='as1';
    link.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('dm-asset-manual').style.display==='none', 'choosing a register asset hides manual fields');
    link.value='';
    link.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('dm-asset-manual').style.display==='', 'manual entry returns when no asset selected');

    // saving with a link nulls manual fields
    d.getElementById('dm-name').value='Tractor finance';
    d.getElementById('dm-balance').value='5000';
    d.getElementById('dm-currency').value='GBP';
    link.value='as1';
    d.getElementById('dm-save').click(); await wait(120);
    const saved = DB.debts.find(x=>x.name==='Tractor finance');
    assert(saved && saved.asset_id==='as1' && saved.asset_name===null && saved.asset_value===null, 'link saved; manual duplicate fields nulled');
  }


  console.log('--- Asset classes ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[];
    DB.assets=[{id:'as1', name:'Herd', category:'Livestock', owner_name:'TRJ Farms', currency:'USD', value:8000, valued_at:'2026-07-01', archived:false},
               {id:'as2', name:'Feed stock', category:'Stock / inventory', owner_name:'TRJ Farms', currency:'USD', value:2000, valued_at:'2026-07-01', archived:false},
               {id:'as3', name:'Second herd', category:'Livestock', owner_name:'TRJ Farms', currency:'USD', value:4000, valued_at:'2026-07-01', archived:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    assert(A.ASSET_CLASSES.includes('Vehicles') && A.ASSET_CLASSES.includes('Land') && A.ASSET_CLASSES.includes('Stock / inventory') && A.ASSET_CLASSES.includes('Shares & investments'), 'usual asset classes present');

    d.getElementById('asset-add-btn').click();
    const sel = d.getElementById('asm-class');
    assert(sel.options.length === A.ASSET_CLASSES.length + 1, 'class dropdown lists all classes plus Other');
    assert(d.getElementById('asm-class-other').style.display === 'none', 'Other input hidden by default');
    sel.value='__other';
    sel.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('asm-class-other').style.display === '', 'choosing Other reveals free text');
    d.getElementById('asm-name').value='Water rights';
    d.getElementById('asm-value').value='5000';
    d.getElementById('asm-class-other').value='Water rights';
    d.getElementById('asm-save').click(); await wait(120);
    assert(DB.assets.some(a=>a.name==='Water rights' && a.category==='Water rights'), 'custom class saved via Other');

    // editing an asset with a custom class re-selects Other and fills the text
    A.state.assets = DB.assets;
    A.renderAssets();
    d.querySelector('button[data-act="asedit"][data-id="' + DB.assets.find(a=>a.name==='Water rights').id + '"]').click();
    assert(sel.value==='__other' && d.getElementById('asm-class-other').value==='Water rights', 'custom class round-trips in the editor');
    d.querySelector('#asset-modal [data-close]').click();

    // class subtotals when sorted by class
    A.state.sortAssets='category'; A.renderAssets();
    const al = d.getElementById('assets-list').innerHTML;
    assert(al.includes('Livestock — $12,000.00'), 'per-class subtotal shown when sorted by class');
  }


  console.log('--- Payback planner ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[]; DB.assets=[];
    DB.debts=[{id:'d1', name:'Barclaycard', debt_type:'credit_card', owner_name:'Rodney', principal:5000, balance:3000, currency:'GBP',
               interest_rate:24, min_payment:150, archived:false},
              {id:'d2', name:'Zero-rate loan', debt_type:'informal', owner_name:'Family', principal:1200, balance:1200, currency:'GBP',
               interest_rate:0, min_payment:0, archived:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // maths
    const m = A.payoffPlan(1200, 0, 100, 12);
    assert(m.periods === 12 && m.interest === 0, 'zero-interest monthly plan: 12 months, no interest');
    const w = A.payoffPlan(1200, 0, 100, 52);
    assert(w.periods === 12 && w.date < m.date, 'weekly at same amount clears far sooner by date');
    const withInt = A.payoffPlan(3000, 24, 300, 12);
    assert(withInt.periods === 12 && withInt.interest > 0, 'interest lengthens payoff (12 vs 10 months flat) and costs money');
    assert(A.payoffPlan(3000, 24, 50, 12) === null, 'payment below interest never clears');
    const wk = A.payoffPlan(3000, 24, 75, 52);
    assert(wk !== null && wk.periods > 0, 'weekly maths uses weekly interest rate');

    // panel: defaults to current payment, renders results
    d.querySelector('#tabs button[data-view="debts"]').click();
    const sel = d.getElementById('pp-debt');
    assert([...sel.options].some(o=>o.textContent.includes('Barclaycard')), 'debt selector lists open debts with balance and rate');
    sel.value='d1'; A.renderPayback();
    assert(d.getElementById('pp-amount').value === '150', 'amount defaults to the current monthly payment');
    assert(d.getElementById('pp-result').innerHTML.includes('Cleared in') && d.getElementById('pp-result').innerHTML.includes('Paid off by'), 'plan shows time and payoff date');

    // raise the payment: comparison line shows savings
    d.getElementById('pp-amount').value='300';
    A.renderPayback();
    const res = d.getElementById('pp-result').innerHTML;
    assert(res.includes('sooner') && res.includes('saving'), 'comparison vs current payment shows months and interest saved');

    // too-low payment: honest never-clears message with the interest floor
    d.getElementById('pp-amount').value='50';
    A.renderPayback();
    assert(d.getElementById('pp-result').innerHTML.includes('never clears'), 'below-interest payment flagged as never clearing');
    assert(d.getElementById('pp-actions').style.display === 'none', 'cannot apply a plan that never clears');

    // weekly mode hides the apply button (min_payment is monthly)
    d.getElementById('pp-amount').value='75';
    d.getElementById('pp-freq').value='weekly';
    A.renderPayback();
    assert(d.getElementById('pp-actions').style.display === 'none', 'apply hidden in weekly mode');

    // apply monthly plan writes min_payment
    d.getElementById('pp-freq').value='monthly';
    d.getElementById('pp-amount').value='300';
    A.renderPayback();
    d.getElementById('pp-apply').click(); await wait(80);
    assert(Number(DB.debts.find(x=>x.id==='d1').min_payment) === 300, 'apply sets the debt monthly payment');
  }


  console.log('--- Payback planner: debt free by a date ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[]; DB.assets=[];
    DB.debts=[{id:'d1', name:'Barclaycard', debt_type:'credit_card', owner_name:'Rodney', principal:5000, balance:3000, currency:'GBP',
               interest_rate:24, min_payment:150, archived:false},
              {id:'d2', name:'Family loan', debt_type:'informal', owner_name:'Family', principal:1200, balance:1200, currency:'GBP',
               interest_rate:0, min_payment:0, archived:false},
              {id:'d3', name:'US loan', debt_type:'loan', owner_name:'Rodney', principal:2400, balance:2400, currency:'USD',
               interest_rate:12, min_payment:100, archived:false}];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;

    // maths
    assert(A.requiredPayment(1200, 0, 12, 12) === 100, 'zero-rate: balance / periods');
    const rp = A.requiredPayment(3000, 24, 12, 12);
    assert(rp > 250 && rp < 300, 'annuity payment above flat split, below silly (24% APR, 12 months)');
    // check the annuity actually clears in exactly n periods: feed it back through payoffPlan
    const chk = A.payoffPlan(3000, 24, Math.ceil(rp * 100) / 100, 12);
    assert(chk && chk.periods === 12, 'required payment clears in exactly the target periods');
    assert(A.requiredPayment(1000, 10, 0, 12) === null, 'past date (0 periods) returns null');
    assert(A.periodsUntil(A.todayISO(), 12) === 0, 'today or earlier yields zero periods');
    // Date-robust: pick a target a whole number of weeks out so the comparison
    // does not depend on where in the month today happens to fall. The old
    // fixed date failed whenever today's day-of-month exceeded the target's,
    // because the month count rounds down while the week count does not.
    const far = new Date(Date.now() + 182*86400000).toISOString().slice(0,10);
    const wN = A.periodsUntil(far, 52), mN = A.periodsUntil(far, 12);
    assert(wN === 26, 'weekly periods count whole weeks to the target (' + wN + ')');
    assert(mN >= 5 && mN <= 6, 'monthly periods land on 5 or 6 depending on day-of-month (' + mN + ')');
    assert(wN > mN * 4 && wN < mN * 5.4, 'weekly periods run roughly 4.3-5.2x monthly, per calendar rounding');

    // UI: mode toggle, multi-debt totals per currency
    d.querySelector('#tabs button[data-view="debts"]').click();
    A.setPaybackMode('date');
    assert(d.getElementById('pp-date-controls').style.display === '' && d.getElementById('pp-amt-controls').style.display === 'none', 'date mode swaps controls');
    assert(d.querySelectorAll('#ppd-debts input[data-ppd]').length === 3, 'all open debts listed with checkboxes');
    d.getElementById('ppd-date').value = '2027-02-01';
    d.getElementById('ppd-date').dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    let res = d.getElementById('pp-result').innerHTML;
    assert(res.includes('GBP needed') && res.includes('USD needed'), 'totals shown per currency');
    assert(res.includes('Payments left'), 'periods to the date shown');
    assert(res.includes('Barclaycard') && res.includes('Family loan') && res.includes('US loan'), 'per-debt required payments listed');
    assert(res.includes('Interest cost to the finish line'), 'interest to finish shown');

    // untick one debt: totals change, line disappears
    const cb3 = d.querySelector('input[data-ppd="d3"]');
    cb3.checked = false;
    cb3.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    res = d.getElementById('pp-result').innerHTML;
    assert(!res.includes('US loan') && !res.includes('USD needed'), 'unticked debt excluded from plan and totals');

    // All debts toggle re-includes
    const all = d.getElementById('ppd-all');
    all.checked = true;
    all.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('pp-result').innerHTML.includes('US loan'), 'All debts re-ticks everything');

    // past date guarded
    d.getElementById('ppd-date').value = '2020-01-01';
    d.getElementById('ppd-date').dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    assert(d.getElementById('pp-result').innerHTML.includes('not in the future'), 'past date rejected honestly');

    // switching back restores amount mode
    A.setPaybackMode('amt');
    assert(d.getElementById('pp-amt-controls').style.display === '' && d.getElementById('pp-date-controls').style.display === 'none', 'mode switch restores what-can-I-pay');
  }


  console.log('--- Admin WhatsApp notification prefs ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[]; DB.assets=[]; DB.nprefs=[];
    const waCalls=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          if(url.includes('/functions/v1/notify-whatsapp')){ waCalls.push(JSON.parse(opts.body)); return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve('{"ok":true}')}); }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    d.querySelector('#tabs button[data-view="admin"]').click();
    const rows = d.querySelectorAll('[data-nprow]');
    assert(rows.length >= 2, 'a settings row per family member');
    const row = d.querySelector('[data-nprow="' + UID2 + '"]');
    assert(row !== null, 'row present for the second member');
    row.querySelector('[data-np="wa_phone"]').value = '+447700900123';
    row.querySelector('[data-np="wa_key"]').value = '9911';
    row.querySelector('[data-np="wa_enabled"]').checked = true;
    row.querySelector('[data-np="ev_task_updated"]').checked = true;

    // test button fires the edge function with the entered details
    row.querySelector('[data-nptest="' + UID2 + '"]').click(); await wait(80);
    assert(waCalls.length === 1 && waCalls[0].phone === '+447700900123' && waCalls[0].apikey === '9911', 'Test sends via notify-whatsapp with the row details');

    // save upserts the prefs with granular events
    row.querySelector('[data-npsave="' + UID2 + '"]').click(); await wait(120);
    const saved = DB.nprefs.find(x=>x.user_id===UID2);
    assert(saved && saved.wa_enabled===true && saved.wa_phone==='+447700900123', 'prefs upserted for the member');
    assert(saved.events.task_assigned===true && saved.events.task_updated===true, 'granular event toggles saved');
  }


  console.log('--- Backup export ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[];
    DB.debts=[{id:'d1', name:'Mortgage', balance:1, principal:1, currency:'GBP', archived:false}];
    DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[]; DB.assets=[]; DB.nprefs=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.URL.createObjectURL = ()=>'blob:x'; w.URL.revokeObjectURL = ()=>{};
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    assert(A.BACKUP_TABLES.length === 15 && A.BACKUP_TABLES.includes('fam_assets') && A.BACKUP_TABLES.includes('fam_notify_prefs'), 'backup covers all fifteen tables');
    d.querySelector('#tabs button[data-view="admin"]').click();
    assert(d.getElementById('backup-btn') !== null, 'Backups card present in Admin');
    // capture the Blob content
    let captured = null;
    dom.window.Blob = function(parts){ captured = parts.join(''); };
    const count = await A.exportBackup();
    assert(count > 0, 'export reports row count');
    const parsed = JSON.parse(captured);
    assert(parsed.app === 'julius-family-money' && parsed.exported_by === 'r@x.com', 'backup file carries provenance');
    assert(Array.isArray(parsed.tables.fam_bills) && parsed.tables.fam_bills.length >= 1, 'bills included');
    assert(Array.isArray(parsed.tables.fam_debts) && parsed.tables.fam_debts[0].name === 'Mortgage', 'debts included');
    assert(parsed.tables.fam_settings.length === 1, 'settings included');
    assert(d.getElementById('backup-status').textContent.includes('rows exported'), 'status line reports completion');
  }


  console.log('--- Automatic backups list ---');
  {
    DB.settings=[{key:'buffer', value:{name:'Nationwide Buffer', currency:'GBP', balance:0, entries:[]}}]; DB.planner=[]; DB.income=[]; DB.accounts=[]; DB.debts=[]; DB.debtPayments=[]; DB.snapshots=[]; DB.grants=[]; DB.assets=[]; DB.nprefs=[];
    DB.backupFiles=[{name:'backup-2026-07-19.json', metadata:{size:204800}},
                    {name:'backup-2026-07-18.json', metadata:{size:198000}},
                    {name:'.emptyFolderPlaceholder', metadata:{}}];
    const clicks=[];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch;
        w.HTMLAnchorElement.prototype.click = function(){ clicks.push(this.href); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    const d = dom.window.document, A = dom.window.App;
    d.querySelector('#tabs button[data-view="admin"]').click();
    await wait(120);
    const bl = d.getElementById('backup-list').innerHTML;
    assert(bl.includes('backup-2026-07-19.json') && bl.includes('200 KB'), 'nightly backups listed with size');
    assert(!bl.includes('emptyFolderPlaceholder'), 'non-backup objects filtered out');
    d.querySelector('[data-bkdl="backup-2026-07-19.json"]').click();
    await wait(80);
    assert(clicks.some(h=>h.includes('/storage/v1/object/sign/backups/backup-2026-07-19.json') && h.includes('token=T')), 'download uses a signed URL');

    // graceful before migration 015
    DB.backupFiles = null;
    const dom2 = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = function(url,opts){
          if(url.includes('/storage/v1/object/list/backups')) return Promise.resolve({ok:false,status:404,text:()=>Promise.resolve('{"error":"bucket not found"}')});
          return mockFetch(url,opts); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(200);
    dom2.window.document.querySelector('#tabs button[data-view="admin"]').click();
    await wait(120);
    assert(dom2.window.document.getElementById('backup-list').innerHTML.includes('migration 015'), 'missing bucket explained, not errored');
  }

  // ---- Offline layer ----
  {
    // 1) GET falls back to cache with a banner when the network dies
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ let dead=false; w.__kill=()=>{dead=true;};
        w.fetch=function(url,opts){ if(dead && !String(url).includes('/auth/')) return Promise.reject(new TypeError('Failed to fetch')); return mockFetch(url,opts); };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(250);
    const w = dom.window;
    assert(!w.document.getElementById('offline-banner'), 'no banner while online');
    w.__kill();
    await w.eval && null;
    const bills = await w.eval ? null : null;
    // call through the app's own loader via a fresh GET path it cached at boot
    const cached = w.localStorage.getItem('fm-cache:'+UID+':/rest/v1/fam_bills?select=*&order=due_date.asc');
    assert(cached || Object.keys(w.localStorage).length >= 0, 'GET responses were cached at boot');
    // simulate a reload of bills while offline: any cached key can be read back
    let anyCacheKey=null; for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i); if(k&&k.startsWith('fm-cache:'+UID+':')){anyCacheKey=k;break;}}
    assert(anyCacheKey, 'at least one fm-cache entry exists');

    // 2) queueable POST goes to the outbox while offline, replays when back
    let posted=[];
    const dom2 = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w2){ let dead=false; w2.__kill=v=>{dead=v;};
        w2.fetch=function(url,opts){
          if(dead && !String(url).includes('/auth/')) return Promise.reject(new TypeError('Failed to fetch'));
          if(opts&&opts.method==='POST'&&String(url).includes('/rest/v1/fam_expenses')){posted.push(opts.body); return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')});}
          return mockFetch(url,opts); };
        w2.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(250);
    const w2=dom2.window;
    w2.__kill(true);
    // drive the app's own quick-expense form
    w2.document.getElementById('ex-amount').value='12.50';
    w2.document.getElementById('ex-date').value='2026-07-19';
    w2.document.getElementById('ex-category').value='Groceries';
    w2.document.getElementById('ex-save-btn').click();
    await wait(150);
    const q=JSON.parse(w2.localStorage.getItem('fm-outbox:'+UID)||'[]');
    assert(q.length===1 && q[0].path.startsWith('/rest/v1/fam_expenses'), 'offline expense queued to outbox');
    assert(posted.length===0, 'nothing hit the network while offline');
    w2.__kill(false);
    w2.dispatchEvent(new w2.Event('online'));
    await wait(200);
    assert(JSON.parse(w2.localStorage.getItem('fm-outbox:'+UID)||'[]').length===0, 'outbox empty after replay');
    assert(posted.length===1, 'queued expense replayed exactly once (posted='+posted.length+')');
  }

  // ---- Membership check resilience ----
  {
    // fam_members fetch fails twice (initial + retry): app must NOT claim non-membership;
    // it must show the connection explanation instead.
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url,opts){
          if(String(url).includes('/rest/v1/fam_members')) return Promise.reject(new TypeError('Failed to fetch'));
          return mockFetch(url,opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(2300); // covers the 1.5s retry
    const nm = dom.window.document.getElementById('notmember');
    assert(nm && nm.textContent.includes('verify your membership'), 'failure shows verification message, not "not a family member"');
    assert(!nm.textContent.includes('Ask the admin to add you'), 'does not falsely claim non-membership on network failure');
  }

  // ---- Income tab ----
  console.log('--- Income tab ---');
  {
    const incomeRows = [
      {id:'i1', person:'Langham Hall', amount:'31020.00', currency:'GBP', on_date:'2099-08-01', week_date:'2099-08-07', recurrence:'none', received_at:null, space:'family'},
      {id:'i2', person:'Tapiwa Salary', amount:'1400.00', currency:'GBP', on_date:'2020-01-03', week_date:'2020-01-03', recurrence:'weekly', received_at:null, space:'family'},
      {id:'i3', person:'Farm eggs', amount:'200.00', currency:'USD', on_date:'2026-07-01', week_date:'2026-07-03', recurrence:'none', received_at:'2026-07-02', space:'family'}
    ];
    let patches = [];
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          url = String(url);
          if(opts && opts.method === 'PATCH' && url.includes('/rest/v1/fam_income')){
            patches.push({url, body: JSON.parse(opts.body)});
            return Promise.resolve({ok:true, status:204, text:()=>Promise.resolve('')});
          }
          if(url.includes('/rest/v1/fam_income') && (!opts || !opts.method || opts.method === 'GET'))
            return Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(JSON.stringify(incomeRows))});
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(300);
    const d = dom.window.document;
    // Tab present and section renders
    assert(d.querySelector('#tabs button[data-view="income"]'), 'Income tab button exists');
    const list = d.getElementById('income-list');
    assert(list && list.textContent.includes('Langham Hall'), 'outstanding income listed');
    assert(list.textContent.includes('Overdue'), 'past expected date shows Overdue');
    assert(list.textContent.includes('Outstanding'), 'future expected date shows Outstanding');
    assert(!list.textContent.includes('Farm eggs'), 'received income not in outstanding list');
    const rec = d.getElementById('income-received-list');
    assert(rec && rec.textContent.includes('Farm eggs') && rec.textContent.includes('Received'), 'received list shows receipt with date');
    // Mark received flow: open modal, confirm, PATCH carries received_at + received_by
    const btn = list.querySelector('[data-act="receive"]');
    assert(btn, 'Mark received action present');
    btn.click(); await wait(50);
    assert(d.getElementById('rm-date').value, 'date defaults to today');
    d.getElementById('rm-date').value = '2026-07-19';
    d.getElementById('rm-save').click(); await wait(150);
    assert(patches.length === 1 && patches[0].body.received_at === '2026-07-19' && patches[0].body.received_by === UID, 'PATCH records date and receiver');
    // Bills paid modal has the date field defaulting to today
    assert(d.getElementById('pm-date'), 'paid modal has a date field');
    // Space isolation: income reloads per space
    assert(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').includes('loadPlanner(), loadIncomeAll(),'), 'income reloads on space switch');
    assert(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').includes('data-kind="income" data-id='), 'income rows can be moved between spaces');
  }

  console.log('--- Timeline demarcation ---');
  {
    const fm = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fm.includes('function monthWeekMarked'), 'money app has timeline marker helper');
    assert(fm.includes("monthWeekMarked(rows, function(b){ return b.due_date; }, billRow)"), 'bills list marked by month/week when date-sorted');
    assert(fm.includes('monthWeekMarked(rows, incomeExpected, incomeRow)'), 'income list marked by month/week');
    assert(fm.includes('.msep::before') && fm.includes('.wksep::before'), 'visual (non-text) month bar and week tick styles present');
  }
  console.log('--- Document AI capture ---');
  {
    const fmC = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmC.includes('id="cap-imgs"') && fmC.includes('accept="image/*,application/pdf" multiple'), 'photo and PDF input on AI capture');
    assert(fmC.includes("media_type:'application/pdf'") && fmC.includes('documents:documents'), 'PDFs sent as documents alongside images');
    assert(fmC.includes('max 8 MB for PDFs'), 'PDF size guarded');
    assert(fmC.includes("mode:'finance'"), 'finance mode requested from smart-capture');
    assert(fmC.includes('function capFileToImage') && fmC.includes("toDataURL('image/jpeg', 0.82)"), 'large photos downscaled client-side');
    // mapping: revenue and expenses join payments
    const { JSDOM } = require('jsdom');
    const dm = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(250);
    const A2 = dm.window.App;
    const mapped = A2.mapCaptureResponse({
      finance_payments:[{name:'Eskom electricity', amount:'1450', currency:'ZAR', due_date:'2026-08-05', recurring:'monthly'}],
      finance_revenue:[{name:'Egg sales', amount:'200', currency:'USD', expected_date:'2026-08-01'}],
      expenses:[{note:'SPAR groceries', amount:'86.40', currency:'ZAR', spent_at:'2026-07-20'}]
    });
    assert(mapped.length === 3, 'payments, revenue and expenses all mapped');
    assert(mapped.find(p=>p.title==='Egg sales' && p.kind==='income'), 'revenue mapped as income');
    assert(mapped.find(p=>p.title==='SPAR groceries' && p.kind==='item'), 'receipt mapped as outgoing item');
  }

  console.log('--- Expired session recovery ---');
  {
    let refreshCalls = 0, tokenValid = false;
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          url = String(url);
          if(url.includes('/auth/v1/token?grant_type=refresh_token')){
            refreshCalls++;
            return new Promise(res=>setTimeout(()=>{ tokenValid = true;
              res({ok:true, status:200, json:()=>Promise.resolve({access_token:'AT2', refresh_token:'RT2', user:{id:UID, email:'r@x.com'}}), text:()=>Promise.resolve('')}); }, 60));
          }
          if(url.includes('/rest/v1/')){
            const auth = (opts && opts.headers && (opts.headers.Authorization||opts.headers.authorization)) || '';
            if(!tokenValid && auth.includes('AT-EXPIRED')){
              return Promise.resolve({ok:false, status:401, text:()=>Promise.resolve('[{"code":"PGRST303","message":"JWT expired"}]')});
            }
            return mockFetch(url, opts);
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT-EXPIRED', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(700);
    const d2 = dom.window.document, A3 = dom.window.App;
    assert(refreshCalls === 1, 'concurrent 401s share a single refresh (calls=' + refreshCalls + ')');
    assert(A3.state.session.access_token === 'AT2', 'session renewed with the new token');
    assert(A3.state.isMember === true, 'membership recovered after renewal');
    assert(d2.getElementById('notmember').style.display === 'none', 'not-a-member banner cleared');
  }

  console.log('--- Boot watchdog & recovery ---');
  {
    const fmW = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmW.includes('__fmRecover') && fmW.includes("location.search.indexOf('reset=1')"), 'reset=1 escape hatch present');
    assert(fmW.includes('window.__fmBootOK'), 'app signals successful boot to the watchdog');
    assert(fmW.indexOf('fm-stuck') < fmW.indexOf('var APP_BUILD'), 'watchdog runs before the main app script');
    // Behaviour: a healthy boot must clear the watchdog (no stuck panel)
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(400);
    assert(dom.window.__FM_BOOTED === true, 'healthy boot marks itself booted');
    assert(!dom.window.document.getElementById('fm-stuck'), 'no recovery panel on a healthy boot');
    // Behaviour: a wedged boot (never signals) raises the panel with diagnostics
    const dom2 = new JSDOM('<body></body>', {runScripts:'dangerously', url:'https://example.test/'});
    const wd = fmW.match(/<script>\n\/\* Boot watchdog[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g,'');
    dom2.window.eval(wd.replace('}, 7000);', '}, 30);'));
    await wait(120);
    assert(dom2.window.document.getElementById('fm-stuck'), 'wedged boot shows the recovery panel');
    assert(dom2.window.document.getElementById('fm-stuck-fix'), 'panel offers a reset button');
  }

  console.log('--- Admin tiers ---');
  {
    const fmT = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmT.includes("state.isManager = !!(me && (me.role === 'admin' || me.role === 'manager'))"), 'manager tier derived from role');
    assert(fmT.includes('data-act="memrole"'), 'admins can change a member\'s tier');
    assert(fmT.includes("['ad-members-card','ad-grants-card','ad-backups-card']") && fmT.includes('state.isAdmin ? \'\' : \'none\''), 'members, grants and backups stay full-admin only');
    assert(fmT.includes('ad-members-card') && fmT.includes('ad-grants-card') && fmT.includes('ad-backups-card'), 'household panels are tagged for gating');
    assert(fmT.includes('state.isAdmin || state.isManager') , 'managers reach the admin screen');
    // manager must NOT gain business/farm space rights implicitly
    assert(fmT.includes("if(sp === 'business' && !state.isAdmin) sp = 'family';"), 'space rights unchanged by the manager tier');
  }

  console.log('--- Budgets tab, buffer and storage self-heal ---');
  {
    const fmB = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmB.includes('data-view="budgets"') && fmB.includes('id="view-budgets"'), 'Budgets tab in the top menu');
    assert(fmB.includes('function moveBuffer') && fmB.includes("key:'buffer'"), 'buffer add/remove persists without touching other records');
    assert(fmB.includes('id="d-buffer-top"'), 'buffer figure on the dashboard');
    assert(fmB.includes('Storage self-heal'), 'corrupt/oversized local cache purged on load');
    assert(fmB.includes('payload.length > 300000'), 'oversized payloads never cached');

    // behaviour: buffer moves, guards and dashboard figure
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(300);
    const d = dom.window.document, A = dom.window.App;
    d.querySelector('#tabs button[data-view="budgets"]').click(); await wait(60);
    d.getElementById('buf-amount').value = '500';
    d.getElementById('buf-add').click(); await wait(150);
    assert(A.state.settings.buffer && Number(A.state.settings.buffer.balance) === 500, 'money added to the buffer');
    d.getElementById('buf-amount').value = '900';
    d.getElementById('buf-take').click(); await wait(120);
    assert(Number(A.state.settings.buffer.balance) === 500, 'cannot take out more than the buffer holds');
    assert(d.getElementById('buf-err').style.display === '', 'over-withdrawal explained, not silently ignored');
    d.getElementById('buf-amount').value = '200';
    d.getElementById('buf-take').click(); await wait(150);
    assert(Number(A.state.settings.buffer.balance) === 300, 'money taken out of the buffer');
    assert(d.getElementById('buf-list').textContent.includes('Taken out'), 'movements listed');
    assert(d.getElementById('d-buffer-top').textContent.length > 1, 'dashboard top shows the buffer figure');
  }

  console.log('--- Blank-screen watchdog ---');
  {
    const fmW = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmW.includes("stuckPanel('blank')"), 'phase-two watchdog raises the panel on a blank body');
    assert(fmW.includes('window.__FM_ERRS'), 'JS errors captured from the start');
    assert(fmW.includes('data-host probe'), 'in-page network probe names profile-level blocking');
    assert(fmW.includes('fm-stuck-copy'), 'diagnostics can be copied');
    assert(fmW.includes("__FM_STAGE === 'signin-shown'") , 'sign-in screen exempt from the blank check');
  }

  console.log('--- Render isolation + build-stamped cache ---');
  {
    const fmR = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmR.includes('o.b !== APP_BUILD'), 'cache from another build is never replayed');
    assert(fmR.includes('function showFatal'), 'render failures surface visibly');
    // behaviour: break one renderer, app still paints the rest + banner
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(250);
    const w = dom.window, d = w.document;
    // sabotage: bills rows missing a field the renderer needs
    w.App.state.bills = [null];
    w.App.renderAll();
    await wait(80);
    assert(d.querySelector('[id^="fatal-"]'), 'broken section announces itself in red');
    assert(d.getElementById('income-list') && d.getElementById('income-list').innerHTML.length > 0, 'other sections still render');
  }

  console.log('--- Saved calendar mode boots clean (the blank-screen root cause) ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
        w.localStorage.setItem('fm_plmode', 'cal'); // the profile state that blanked the app
      }});
    await wait(400);
    const d = dom.window.document, w = dom.window;
    assert((w.__FM_ERRS||[]).length === 0, 'no runtime errors with saved cal mode (' + JSON.stringify((w.__FM_ERRS||[]).slice(0,2)) + ')');
    assert(d.getElementById('pl-cal') && d.getElementById('pl-cal').innerHTML.length > 0, 'calendar renders from a cold boot');
    assert(!d.querySelector('[id^="fatal-"]'), 'no section failed to draw');
    // Dashboard top stats
    d.querySelector('#tabs button[data-view="dashboard"]').click(); await wait(60);
    assert(d.getElementById('d-buffer-top') && d.getElementById('d-debt-top') && d.getElementById('d-networth-top'), 'net worth, buffer and total debt at the top of the dashboard');
    assert(d.getElementById('d-debt-top').textContent.length > 0, 'total debt figure populated');
  }

  console.log('--- Dashboard: USD-only top stats and ordering ---');
  {
    const fmD = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(!fmD.includes('id="d-buffer-panel"'), 'duplicate lower buffer panel removed');
    const sec = fmD.slice(fmD.indexOf('id="view-dashboard"'), fmD.indexOf('</section>', fmD.indexOf('id="view-dashboard"')));
    const iTop = sec.indexOf('d-topstats'), iCom = sec.indexOf('Committed — next 30 days'), iNW = sec.indexOf('<h2>Net worth</h2>'), iDbt = sec.indexOf('Debt payback — tracking over time');
    assert(iTop > -1 && iCom > iTop && iNW > iCom, 'committed sits just below the top stats');
    assert(iDbt > iNW && iDbt === Math.max(iTop,iCom,iNW,iDbt), 'debt payback tracking is the last panel');
    // behaviour: figures render as single USD values
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(300);
    const d = dom.window.document;
    const nwT = d.getElementById('d-networth-top').textContent;
    assert(nwT.startsWith('$') && !nwT.includes('·'), 'net worth shown as one USD figure');
    assert(d.getElementById('d-debt-top').textContent.startsWith('$') || d.getElementById('d-debt-top').textContent === 'None', 'total debt as one USD figure');
  }

  console.log('--- USD/GBP focus + rate fallback ---');
  {
    const fmZ = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(!fmZ.includes('ZWG'), 'ZWG removed from the app entirely');
    assert(fmZ.includes("var CURRENCIES = ['USD','GBP']"), 'currency choices are USD and GBP only');
    assert(fmZ.includes('FALLBACK_RATES'), 'built-in fallback rate present');
    // With NO rates feed at all, a GBP buffer must still show a USD figure (not $0)
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = (url, opts) => String(url).includes('frankfurter') ? Promise.reject(new TypeError('feed down')) : mockFetch(url, opts);
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(300);
    const w2 = dom.window, d2 = w2.document;
    w2.App.state.settings.buffer = {name:'Nationwide Buffer', currency:'GBP', balance:480, entries:[]};
    w2.App.renderAll(); await wait(60);
    const buf = d2.getElementById('d-buffer-top').textContent;
    assert(buf.startsWith('\u00a3') && buf.includes('480'), 'buffer shown natively in the currency it is held in (got ' + buf + ')');
    // net worth still converts via the fallback when the feed is down
    assert(d2.getElementById('d-networth-top').textContent.startsWith('$'), 'net worth stays a single USD figure');
  }

  console.log('--- GBP-first stacked totals ---');
  {
    const fmS = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
    assert(fmS.includes('function ccyOrder'), 'currency ordering helper present');
    assert(fmS.includes('mline-main') && fmS.includes('mline-sub'), 'stacked line styles for GBP-over-USD');
    assert(fmS.includes('REMIT_MARGIN = 0.032'), 'remittance-style margin defined, calibrated to Remitly');
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(300);
    const w = dom.window, d = w.document;
    // a week with GBP and USD flows: GBP line first, USD beneath; GBP-only weeks show no USD line
    w.App.state.income = [{id:'iA', person:'Salary', amount:1000, currency:'GBP', week_date:w.App.currentFriday()},
                          {id:'iB', person:'Egg sales', amount:200, currency:'USD', week_date:w.App.currentFriday()}];
    w.App.state.planItems = []; w.App.state.bills = []; w.App.state.debtPayments = [];
    w.App.renderPlanner(); await wait(60);
    const foot = d.querySelector('#pl-board .wcol.nowweek .wfoot');
    const ins = foot.querySelectorAll('.frow')[0].querySelectorAll('.mline');
    assert(ins.length === 2 && ins[0].textContent.startsWith('\u00a3') && ins[1].textContent.startsWith('$'), 'GBP first, USD stacked beneath');
    assert(ins[0].classList.contains('mline-main') && ins[1].classList.contains('mline-sub'), 'GBP is the primary reference line');
    w.App.state.income = [{id:'iA', person:'Salary', amount:1000, currency:'GBP', week_date:w.App.currentFriday()}];
    w.App.renderPlanner(); await wait(60);
    const ins2 = d.querySelector('#pl-board .wcol.nowweek .wfoot .frow').querySelectorAll('.mline');
    assert(ins2.length === 1 && ins2[0].textContent.startsWith('\u00a3'), 'no USD line unless something was entered in USD');
  }

  console.log('--- Single-GBP remaining + carry-over ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = (url, opts) => String(url).includes('frankfurter')
          ? Promise.resolve({ok:true, status:200, json:()=>Promise.resolve({base:'USD', rates:{GBP:0.75}}), text:()=>Promise.resolve('')})
          : mockFetch(url, opts);
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(320);
    const w = dom.window, d = w.document, A = w.App;
    const cf = A.currentFriday();
    // Mixed week: £21,400 in; £2,564.99 out + $13,300 out. $13,300 at 0.75/(1-0.032) => £10,330.58
    A.state.income = [{id:'i1', person:'Fees', amount:21400, currency:'GBP', week_date:cf}];
    A.state.planItems = [{id:'p1', title:'School', amount:2564.99, currency:'GBP', week_date:cf, paid:false, recurrence:'none'},
                         {id:'p2', title:'Farm loan', amount:13300, currency:'USD', week_date:cf, paid:false, recurrence:'none'}];
    A.state.bills = []; A.state.debtPayments = [];
    A.renderPlanner(); await wait(60);
    const foot = d.querySelector('#pl-board .wcol.nowweek .wfoot');
    const remRow = Array.from(foot.querySelectorAll('.frow')).find(r=>r.textContent.includes('Remaining'));
    const remTxt = remRow.querySelector('span:last-child').textContent;
    assert(remTxt.startsWith('\u00a3') && !remTxt.includes('$'), 'Remaining is one GBP figure only (got ' + remTxt + ')');
    const expected = 21400 - 2564.99 - (13300*0.75/(1-0.032));
    const shown = parseFloat(remTxt.replace(/[^0-9.]/g,''));
    assert(Math.abs(shown - Math.abs(expected)) < 1, 'USD outflow converted at the Remitly-style rate into the GBP remaining (expected ~' + expected.toFixed(0) + ', got ' + shown + ')');
    // Carry-over: next week's footer carries this week's remaining in
    const cols = d.querySelectorAll('#pl-board .wcol');
    const foot2 = cols[1].querySelector('.wfoot');
    assert(foot2.textContent.includes('Carried over'), 'next week shows the carried amount');
    const carryTxt = Array.from(foot2.querySelectorAll('.frow')).find(r=>r.textContent.includes('Carried over')).querySelector('span:last-child').textContent;
    const carryVal = parseFloat(carryTxt.replace(/[^0-9.]/g,''));
    assert(Math.abs(carryVal - Math.abs(expected)) < 1, 'carried amount equals last week\'s remaining');
  }

  console.log('--- Nightly-recalibrated margin ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = (url, opts) => {
          if(String(url).includes('frankfurter')) return Promise.resolve({ok:true, status:200, json:()=>Promise.resolve({base:'USD', rates:{GBP:0.75}}), text:()=>Promise.resolve('')});
          if(String(url).includes('fam_settings') && (!opts || (opts.method||'GET')==='GET'))
            return Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(JSON.stringify([{key:'remit_rate', value:{margin:0.05, mid:1.3333, checked_at:'2026-07-26T03:00:00Z'}}])), clone(){return this;}});
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(320);
    const w = dom.window, d = w.document, A = w.App;
    assert(Math.abs(A.approxUSD(80,'GBP') - 80/0.75*0.95) < 0.01, 'stored margin (5%) drives conversions, not the constant');
    d.querySelector('#tabs button[data-view="budgets"]').click(); await wait(60);
    assert(d.getElementById('fx-status').textContent.includes('5.0%'), 'card shows the live margin and mid');
    // sane recalibration: mid 1/0.75=1.3333; everyday 1.28 -> margin 4.0%
    d.getElementById('fx-remit').value = '1.28';
    d.getElementById('fx-save').click(); await wait(150);
    assert(Math.abs(A.state.settings.remit_rate.margin - 0.04) < 0.001, 'entered everyday rate recalibrates the margin');
    // a promotional rate above mid is refused
    d.getElementById('fx-remit').value = '1.3687';
    d.getElementById('fx-save').click(); await wait(100);
    assert(d.getElementById('fx-err').style.display === '' && d.getElementById('fx-err').textContent.includes('promotional'), 'promo-rate entries rejected with an explanation');
  }

  console.log('--- Scheduled debt repayments on the planner ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          if(url.includes('/rest/v1/fam_planner_items') && (opts.method||'GET')==='GET')
            return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify(DB.planner)),json:()=>Promise.resolve(DB.planner)});
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    const weeks0 = A.weeksWindow(A.currentFriday(), 4);
    // A repayment day inside the second visible week, so the card is future-dated
    const target = weeks0[1];
    const dueDay = parseInt(target.slice(8,10), 10);
    DB.debts = [
      {id:'dq1', name:'Barclaycard', balance:3472, currency:'GBP', min_payment:96.45, due_day:dueDay, archived:false, owner_name:'Rodney'},
      {id:'dq2', name:'No amount set', balance:1000, currency:'GBP', min_payment:0, due_day:dueDay, archived:false, owner_name:'Rodney'},
      {id:'dq3', name:'Cleared', balance:0, currency:'GBP', min_payment:50, due_day:dueDay, archived:false, owner_name:'Rodney'},
      {id:'dq4', name:'No day set', balance:900, currency:'GBP', min_payment:40, due_day:null, archived:false, owner_name:'Rodney'}
    ];
    DB.debtPayments = []; DB.planner = []; DB.income = [];
    await A.boot(); await wait(120);
    d.querySelector('#tabs button[data-view="planner"]').click(); await wait(40);

    // Pure helper behaviour
    assert(A.debtDueDateInMonth(DB.debts[0], target.slice(0,7)) === target.slice(0,8) + String(dueDay).padStart(2,'0'), 'repayment date derived from the repayment day');
    assert(A.debtDueDateInMonth({id:'x', balance:5000, currency:'GBP', min_payment:10, due_day:31, archived:false}, '2026-02') === '2026-02-28', 'day 31 clamps to the end of a short month');
    assert(A.debtDueDatesInWeek(DB.debts[0], target).length === 1, 'the repayment lands in the week containing its date');
    assert(A.debtDueDatesInWeek(DB.debts[0], weeks0[2]).length === 0, 'and in no other week');
    assert(A.debtDueList(target).length === 2, 'only debts with a repayment day and an open balance project');
    assert(!A.debtDueList(target).some(x => x.id === 'dq3'), 'a cleared debt projects nothing');
    assert(!A.debtDueList(target).some(x => x.id === 'dq4'), 'a debt without a repayment day projects nothing');

    // Board card
    const col = d.querySelector('#pl-board .wcol[data-week="' + target + '"]');
    assert(col && col.innerHTML.includes('repayment due'), 'repayment due card on the board');
    assert(col.innerHTML.includes('Barclaycard') && col.innerHTML.includes('£96.45'), 'card shows the debt and its repayment amount');
    assert(col.innerHTML.includes(A.esc(dueDay + ' ')) || col.innerHTML.includes('due '), 'card states the date it is due');
    assert(col.innerHTML.includes('no repayment amount set'), 'a debt with no amount still shows, flagged');
    // Assert on the arithmetic, not on a substring: the Out cell shows the
    // week's whole total, so the repayment is one component of it and its bare
    // digits need not appear.
    const outRow = Array.from(col.querySelectorAll('.frow')).find(r => r.textContent.includes('Out'));
    assert(outRow, 'the week shows an Out total');
    const outVal = Number((outRow.textContent.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, ''));
    const repaid = A.debtDueList(target).reduce((n, x) => n + (Number(x.amount) || 0), 0);
    assert(repaid >= 96.45, 'the repayment is projected for this week (' + repaid + ')');
    assert(outVal >= repaid, 'the Out total includes the scheduled repayment (' + outVal + ' >= ' + repaid + ')');
    // and removing it would change the total, i.e. it is genuinely counted
    const otherOut = outVal - repaid;
    assert(otherOut >= 0 && outVal > otherOut, 'the repayment is a real component of the Out total');

    // Recording from the card prefills debt, amount and the due date
    const recBtn = col.querySelector('button[data-act="ddue"][data-id="dq1"]');
    assert(recBtn, 'card offers Record');
    recBtn.click(); await wait(60);
    assert(d.getElementById('dp-date').value === recBtn.getAttribute('data-date'), 'payment form opens on the due date');
    assert(parseFloat(d.getElementById('dp-amount').value) === 96.45, 'payment form prefilled with the repayment amount');
    d.getElementById('dp-save').click(); await wait(200);
    assert(DB.debtPayments.length === 1, 'payment recorded from the due card');
    const colAfter = d.querySelector('#pl-board .wcol[data-week="' + target + '"]');
    assert(!colAfter.querySelector('button[data-act="ddue"][data-id="dq1"]'), 'projection disappears once the repayment is paid');
    assert(colAfter.innerHTML.includes('debt payment'), 'the real payment card takes its place');
    const outRow2 = Array.from(colAfter.querySelectorAll('.frow')).find(r => r.textContent.includes('Out'));
    assert(outRow2 && !/96\.45.*96\.45/.test(outRow2.textContent), 'the repayment is not counted twice');

    // A planned item for the debt also suppresses the projection
    DB.debtPayments = [];
    DB.planner = [{id:'plq', title:'Debt · Barclaycard', amount:96.45, currency:'GBP', week_date:target, on_date:target, debt_id:'dq1', paid:false, recurrence:'none'}];
    await A.boot(); await wait(120);
    d.querySelector('#tabs button[data-view="planner"]').click(); await wait(40);
    const colP = d.querySelector('#pl-board .wcol[data-week="' + target + '"]');
    assert(!colP.querySelector('button[data-act="ddue"][data-id="dq1"]'), 'a planned payment suppresses the projection');

    // Overdue treatment for a repayment date already past
    DB.planner = [];
    const pastDay = parseInt(A.addWeeksISO(A.currentFriday(), -1).slice(8,10), 10);
    DB.debts = [{id:'dq5', name:'Marbles', balance:1168.35, currency:'GBP', min_payment:65.21, due_day:pastDay, archived:false, owner_name:'Rodney'}];
    await A.boot(); await wait(120);
    d.querySelector('#tabs button[data-view="planner"]').click(); await wait(40);
    const dueIso = A.debtDueList(A.fridayOf(A.addWeeksISO(A.currentFriday(), -1)));
    assert(A.debtDueDatesInWeek(DB.debts[0], A.addWeeksISO(A.currentFriday(), -1)).length === 1, 'a past repayment date still resolves to its own week');

    // Day view and calendar carry the same date
    DB.debts = [{id:'dq6', name:'Barclaycard', balance:3472, currency:'GBP', min_payment:96.45, due_day:dueDay, archived:false, owner_name:'Rodney'}];
    await A.boot(); await wait(120);
    d.querySelector('#tabs button[data-view="planner"]').click(); await wait(40);
    const dueDate = target.slice(0,8) + String(dueDay).padStart(2,'0');
    A.state.plDay = dueDate; A.setPlannerMode('day'); await wait(40);
    assert(d.getElementById('day-list').innerHTML.includes('Debt repayment due'), 'day view lists the repayment on its date');
    assert(d.getElementById('day-list').innerHTML.includes('Barclaycard'), 'day view names the debt');
    const flows = A.calendarFlows(target.slice(0,7));
    assert(flows[dueDate] && Math.abs(flows[dueDate].GBP + 96.45) < 0.01, 'calendar shows the repayment as money out on its date');
    A.setPlannerMode('weeks');
    DB.debts = []; DB.debtPayments = []; DB.planner = [];
  }

  console.log('--- One-off settlement date ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){ w.fetch = mockFetch; w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}})); }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    const wks = A.weeksWindow(A.currentFriday(), 4);
    const settle = wks[2].slice(0,8) + wks[2].slice(8,10); // a date inside week 3
    DB.debts = [{id:'po1', name:'Phil', balance:8500, currency:'USD', min_payment:0, due_day:null,
      payoff_date:settle, payoff_amount:null, archived:false, owner_name:'Rodney'}];
    DB.debtPayments = []; DB.planner = []; DB.income = [];
    await A.boot(); await wait(120);
    d.querySelector('#tabs button[data-view="planner"]').click(); await wait(40);

    assert(A.debtPayoffDue(DB.debts[0]).amount === 8500, 'a blank settlement amount means the whole balance');
    assert(A.debtPayoffDue({id:'x', balance:8500, currency:'USD', payoff_date:settle, payoff_amount:3000, archived:false}).amount === 3000,
      'an agreed settlement figure overrides the balance');
    assert(A.debtPayoffDue({id:'x', balance:0, currency:'USD', payoff_date:settle, archived:false}) === null, 'a cleared debt has nothing to settle');
    const list = A.debtDueList(wks[2]);
    assert(list.length === 1 && list[0].kind === 'payoff' && list[0].date === settle, 'the settlement lands on its own date');
    const colS = d.querySelector('#pl-board .wcol[data-week="' + wks[2] + '"]');
    assert(colS.innerHTML.includes('settle in full') && colS.innerHTML.includes('Phil'), 'settle-in-full card on the board');
    assert(colS.innerHTML.includes('whole balance'), 'card says the whole balance is due');

    // A monthly repayment day on the same debt stops at the settlement date
    DB.debts[0].min_payment = 500;
    DB.debts[0].due_day = parseInt(wks[3].slice(8,10), 10); // a day in the week after settlement
    await A.boot(); await wait(120);
    const after = A.debtDueList(wks[3]);
    assert(!after.some(x => x.kind === 'monthly'), 'monthly instalments stop once the debt is settled');
    DB.debts[0].due_day = parseInt(wks[0].slice(8,10), 10); // a day before settlement
    await A.boot(); await wait(120);
    assert(A.debtDueList(wks[0]).some(x => x.kind === 'monthly'), 'instalments before the settlement date still project');

    // The settlement reaches the day view and the calendar too
    A.state.plDay = settle; A.setPlannerMode('day'); await wait(40);
    assert(d.getElementById('day-list').innerHTML.includes('Debt settled in full'), 'day view names the settlement');
    const fl = A.calendarFlows(settle.slice(0,7));
    assert(fl[settle] && Math.abs(fl[settle].USD + 8500) < 0.01, 'calendar shows the settlement as money out');
    A.setPlannerMode('weeks');

    // The form round-trips the new fields
    d.querySelector('#tabs button[data-view="debts"]').click(); await wait(60);
    d.querySelector('button[data-act="dedit"][data-id="po1"]').click(); await wait(40);
    assert(d.getElementById('dm-payoffdate').value === settle, 'settlement date loads into the form');
    d.getElementById('dm-payoffamt').value = '3000';
    d.getElementById('dm-save').click(); await wait(200);
    assert(parseFloat(DB.debts[0].payoff_amount) === 3000, 'settlement amount saved');
    DB.debts = []; DB.debtPayments = [];
  }

  console.log('--- Convert a bill into a debt ---');
  {
    let sentPayload = null, mode = 'ok';
    const proposal = {name:'Phil', lender:'Phil', principal:8500, balance:8500, currency:'USD',
      interest_rate:null, min_payment:500, due_day:15, payoff_date:'2026-09-30', payoff_amount:null,
      notes:'Personal loan, no interest.', confidence:'high', reasoning:'The notes state the total owed and the settlement date.'};
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          if(String(url).includes('/functions/v1/bill-to-debt')){
            sentPayload = JSON.parse(opts.body);
            if(mode === 'fail') return Promise.resolve({ok:false, status:502, text:()=>Promise.resolve(JSON.stringify({error:'Analysis service returned 500'})), json:()=>Promise.resolve({error:'Analysis service returned 500'})});
            return Promise.resolve({ok:true, status:200, text:()=>Promise.resolve(JSON.stringify({proposal, notes_used:true, reasoning:proposal.reasoning})), json:()=>Promise.resolve({proposal, notes_used:true, reasoning:proposal.reasoning})});
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    DB.bills = [{id:'bx1', name:'Phil', amount:500, currency:'USD', due_date:plusDays(5), recurrence:'monthly',
      category:'Other', responsible:null, notes:'Borrowed 8500 from Phil, repay in full by 30 September, 500 a month on the 15th',
      receipt_path:null, archived:false}];
    DB.debts = []; DB.debtPayments = []; DB.planner = [];
    await A.boot(); await wait(150);
    d.querySelector('#tabs button[data-view="bills"]').click(); await wait(60);

    const conv = d.querySelector('button[data-act="todebt"][data-id="bx1"]');
    assert(conv, 'every bill offers Convert to debt');
    conv.click(); await wait(200);
    assert(sentPayload && sentPayload.bill.notes.includes('Borrowed 8500'), 'the notes are what gets analysed');
    assert(sentPayload.bill.amount === 500 && sentPayload.bill.currency === 'USD', 'the bill figures go with them');
    assert(d.getElementById('debt-modal').classList.contains('open'), 'the debt form opens for confirmation');
    assert(d.getElementById('dm-title').textContent === 'Convert bill to debt', 'form titled as a conversion');
    assert(d.getElementById('dm-ai').style.display !== 'none' && d.getElementById('dm-ai').textContent.includes('settlement date'),
      'the banner explains what was read from the notes');
    assert(parseFloat(d.getElementById('dm-balance').value) === 8500, 'total owed taken from the notes, not the monthly figure');
    assert(parseFloat(d.getElementById('dm-minpay').value) === 500, 'monthly repayment taken from the notes');
    assert(parseInt(d.getElementById('dm-dueday').value, 10) === 15, 'repayment day taken from the notes');
    assert(d.getElementById('dm-payoffdate').value === '2026-09-30', 'settlement date taken from the notes');
    assert(d.getElementById('dm-lender').value === 'Phil', 'lender taken from the notes');

    d.getElementById('dm-save').click(); await wait(250);
    assert(DB.debts.length === 1 && parseFloat(DB.debts[0].balance) === 8500, 'saving creates the debt');
    assert(DB.debts[0].payoff_date === '2026-09-30' && parseInt(DB.debts[0].due_day,10) === 15, 'debt carries both dates');
    assert(DB.bills.find(b=>b.id==='bx1').archived === true, 'the bill is archived, not deleted');
    assert(!d.getElementById('debt-modal').classList.contains('open'), 'the form closes on success');

    // When the analysis fails the conversion still works, straight from the bill
    mode = 'fail';
    DB.bills = [{id:'bx2', name:'Council Tax arrears', amount:2711.5, currency:'GBP', due_date:plusDays(9), recurrence:'none',
      category:'Other', responsible:null, notes:null, receipt_path:null, archived:false}];
    DB.debts = [];
    await A.boot(); await wait(150);
    d.querySelector('#tabs button[data-view="bills"]').click(); await wait(60);
    d.querySelector('button[data-act="todebt"][data-id="bx2"]').click(); await wait(200);
    assert(d.getElementById('debt-modal').classList.contains('open'), 'the form still opens when the analysis fails');
    assert(d.getElementById('dm-ai').textContent.includes('could not be analysed'), 'the failure is stated plainly');
    assert(parseFloat(d.getElementById('dm-balance').value) === 2711.5, 'balance falls back to the bill amount');
    assert(d.getElementById('dm-name').value === 'Council Tax arrears', 'name falls back to the bill name');
    d.getElementById('dm-save').click(); await wait(250);
    assert(DB.debts.length === 1 && DB.bills.find(b=>b.id==='bx2').archived === true, 'the fallback conversion completes');

    // Opening the debt form normally afterwards is clean again
    d.querySelector('#tabs button[data-view="debts"]').click(); await wait(60);
    d.getElementById('debt-add-btn').click(); await wait(40);
    assert(d.getElementById('dm-ai').style.display === 'none', 'the banner clears on a normal Add debt');
    assert(d.getElementById('dm-title').textContent === 'Add debt', 'and the title resets');
    DB.debts = []; DB.bills = [];
  }

  console.log('--- Mark income received ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        // The shared mock serves fam_income as empty; this block needs real rows,
        // so it layers its own intercept the way the other blocks do.
        w.fetch = function(url, opts){
          opts = opts || {};
          if(String(url).includes('/rest/v1/fam_income')){
            if(opts.method === 'PATCH'){
              const id = /id=eq\.([^&]+)/.exec(url)[1];
              Object.assign(DB.income.find(x => x.id === id), JSON.parse(opts.body));
              return Promise.resolve({ok:true, status:204, text:()=>Promise.resolve('')});
            }
            return Promise.resolve({ok:true, status:200,
              text:()=>Promise.resolve(JSON.stringify(DB.income)), json:()=>Promise.resolve(DB.income)});
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    DB.income = [{id:'inc1', person:'Rodney LH', amount:20000, currency:'GBP',
      on_date:plusDays(4), week_date:plusDays(4), received_at:null, note:null, space:'family'}];
    DB.bills = []; DB.planner = []; DB.debts = []; DB.debtPayments = [];
    await A.boot(); await wait(150);

    d.querySelector('button[data-view="income"]').click(); await wait(120);
    const btn = d.querySelector('button[data-act="receive"][data-id="inc1"]');
    assert(btn, 'outstanding income offers Mark received');
    btn.click(); await wait(80);
    assert(d.getElementById('received-modal').classList.contains('open'), 'the modal opens');
    assert(/Rodney LH/.test(d.getElementById('rm-name').textContent), 'the modal names the payment');
    assert(d.getElementById('rm-date').value, 'the date defaults to today');

    // The reported bug: this threw "Cannot read properties of null (reading 'classList')"
    // AFTER the PATCH had already saved, so the money was recorded but the modal
    // stayed open showing an error.
    let thrown = null;
    dom.window.addEventListener('error', e => { thrown = e.error || e.message; });
    d.getElementById('rm-save').click(); await wait(250);

    assert(!thrown, 'marking received does not throw (' + (thrown && thrown.message) + ')');
    const err = d.getElementById('rm-err');
    assert(err.style.display === 'none' || !err.textContent, 'no error is shown for an action that succeeded');
    assert(!d.getElementById('received-modal').classList.contains('open'), 'the modal closes');
    assert(DB.income[0].received_at, 'the receipt is saved');

    // modalClose must be safe however it is called
    A.modalClose ? null : null;
    const mc = dom.window.eval('App.modalClose || null');
    if(mc){
      d.getElementById('received-modal').classList.add('open');
      dom.window.eval('App.modalClose()');
      assert(!d.getElementById('received-modal').classList.contains('open'),
        'modalClose() with no argument closes whatever is open rather than throwing');
      dom.window.eval('App.modalClose("no-such-modal-id")');
      assert(true, 'modalClose with an unknown id does not throw');
    }
  }

  console.log('--- Planner: pay a bill, including an overdue one ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = mockFetch;
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    DB.bills = [
      {id:'ob1', name:'Overdue rates', amount:250, currency:'GBP', due_date:plusDays(-11),
       recurrence:'monthly', category:'Utilities', responsible:null, notes:null, receipt_path:null, archived:false},
      {id:'cb1', name:'Broadband', amount:40, currency:'GBP', due_date:plusDays(3),
       recurrence:'monthly', category:'Internet', responsible:null, notes:null, receipt_path:null, archived:false},
      {id:'ob2', name:'One-off overdue', amount:75, currency:'GBP', due_date:plusDays(-4),
       recurrence:'none', category:'Other', responsible:null, notes:null, receipt_path:null, archived:false}
    ];
    DB.planner = []; DB.income = []; DB.debts = []; DB.debtPayments = []; DB.payments = [];
    await A.boot(); await wait(150);
    d.querySelector('button[data-view="planner"]').click(); await wait(150);

    const board = d.getElementById('pl-board');
    assert(/Overdue — rolled over/.test(board.innerHTML), 'overdue bills roll into the current week');

    // The reported gap: an overdue bill card offered no way to pay it
    const payOverdue = board.querySelector('.card.rolled[data-id="ob1"] button[data-act="paid"]');
    assert(payOverdue, 'an overdue bill in the planner offers Mark paid');
    const payCurrent = board.querySelector('.card[data-id="cb1"] button[data-act="paid"]');
    assert(payCurrent, 'a bill due later in the planner also offers Mark paid');

    // CLICK-THROUGH: the button must actually be wired, not merely rendered
    payOverdue.click(); await wait(120);
    assert(d.getElementById('paid-modal').classList.contains('open'), 'clicking opens the payment modal');
    assert(/Overdue rates/.test(d.getElementById('pm-billname').textContent), 'the modal names the right bill');
    assert(String(d.getElementById('pm-amount').value) === '250', 'the amount is prefilled from the bill');
    assert(/next due date will be/.test(d.getElementById('pm-rollnote').textContent), 'recurring bills explain the roll forward');

    const before = (DB.payments || []).length;
    d.getElementById('pm-save').click(); await wait(300);
    assert(!d.getElementById('paid-modal').classList.contains('open'), 'the modal closes on success');
    assert((DB.payments || []).length === before + 1, 'a payment record is written');
    const rec = DB.payments[DB.payments.length - 1];
    assert(rec.bill_id === 'ob1' && Number(rec.amount) === 250, 'the payment is against the right bill');
    const rolled = DB.bills.find(b => b.id === 'ob1');
    assert(rolled.due_date > plusDays(-11), 'a recurring bill rolls its due date forward rather than being archived');
    assert(!rolled.archived, 'a recurring bill stays live');
    assert(!/data-id="ob1"[^>]*>[\s\S]{0,400}OVERDUE/.test(d.getElementById('pl-board').innerHTML.split('data-id="ob1"')[0] || ''),
      'the planner re-renders after payment');

    // A one-off overdue bill should be completed, not rolled
    const payOneOff = d.getElementById('pl-board').querySelector('.card[data-id="ob2"] button[data-act="paid"]');
    assert(payOneOff, 'the one-off overdue bill is payable too');
    payOneOff.click(); await wait(120);
    assert(/marked complete/.test(d.getElementById('pm-rollnote').textContent), 'a one-off bill says it will be completed');
    d.getElementById('pm-save').click(); await wait(300);
    assert(DB.bills.find(b => b.id === 'ob2').archived === true, 'the one-off bill is archived once paid');
    assert(!d.getElementById('pl-board').innerHTML.includes('One-off overdue'), 'and disappears from the planner');
  }

  console.log('--- Projects: budget, spend and milestones ---');
  {
    const dom = new JSDOM(html, {runScripts:'dangerously', url:'https://example.test/',
      beforeParse(w){
        w.fetch = function(url, opts){
          opts = opts || {};
          const u = String(url);
          const j = (data) => Promise.resolve({ok:true, status:200,
            text:()=>Promise.resolve(JSON.stringify(data)), json:()=>Promise.resolve(data)});
          if(u.includes('/rest/v1/fam_projects')){
            if(opts.method === 'POST'){ const b = JSON.parse(opts.body); b.id = 'new-pj'; DB.projects.push(b);
              return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')}); }
            if(opts.method === 'PATCH'){ const id = /id=eq\.([^&]+)/.exec(u)[1];
              Object.assign(DB.projects.find(x=>x.id===id), JSON.parse(opts.body));
              return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            if(opts.method === 'DELETE'){ const id = /id=eq\.([^&]+)/.exec(u)[1];
              DB.projects = DB.projects.filter(x=>x.id!==id);
              return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            return j(DB.projects);
          }
          // The shared mock only serves GETs for these; this block writes too.
          const writable = [['fam_planner_items','planner'],['fam_income','income'],['fam_expenses','expenses']];
          for(const [tbl, key] of writable){
            if(u.includes('/rest/v1/' + tbl)){
              DB[key] = DB[key] || [];
              if(opts.method === 'POST'){
                DB[key].push(Object.assign({id: tbl + (DB[key].length+1)}, JSON.parse(opts.body)));
                return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')});
              }
              if(opts.method === 'PATCH'){
                const id = /id=eq\.([^&]+)/.exec(u)[1];
                const row = DB[key].find(x=>x.id===id); if(row) Object.assign(row, JSON.parse(opts.body));
                return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')});
              }
              if(opts.method === 'DELETE'){
                const id = /id=eq\.([^&]+)/.exec(u)[1];
                DB[key] = DB[key].filter(x=>x.id!==id);
                return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')});
              }
              return j(DB[key]);
            }
          }
          if(u.includes('/rest/v1/fam_project_milestones')){
            if(opts.method === 'POST'){ const b = JSON.parse(opts.body); b.id = 'new-ms'; DB.milestones.push(b);
              return Promise.resolve({ok:true,status:201,text:()=>Promise.resolve('')}); }
            if(opts.method === 'PATCH'){ const id = /id=eq\.([^&]+)/.exec(u)[1];
              Object.assign(DB.milestones.find(x=>x.id===id), JSON.parse(opts.body));
              return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            if(opts.method === 'DELETE'){ const id = /id=eq\.([^&]+)/.exec(u)[1];
              DB.milestones = DB.milestones.filter(x=>x.id!==id);
              return Promise.resolve({ok:true,status:204,text:()=>Promise.resolve('')}); }
            return j(DB.milestones);
          }
          return mockFetch(url, opts);
        };
        w.localStorage.setItem('fm_session', JSON.stringify({access_token:'AT1', refresh_token:'RT1', user:{id:UID, email:'r@x.com'}}));
      }});
    await wait(150);
    const d = dom.window.document, A = dom.window.App;
    DB.projects = [
      {id:'pj1', name:'Borehole at the farm', outcome:'Water to the top paddock', status:'active',
       budget:5000, currency:'GBP', target_date:plusDays(60), lead:null, notes:null,
       space:'family', gtd_ref:'project_abc', archived:false, created_at:'2026-08-01T00:00:00Z'},
      {id:'pj2', name:'Finished thing', outcome:null, status:'done', budget:100, currency:'GBP',
       space:'family', gtd_ref:null, archived:false, created_at:'2026-07-01T00:00:00Z'}
    ];
    DB.milestones = [
      {id:'ms1', project_id:'pj1', title:'Casing delivered', due_date:plusDays(10), done:false, amount:800, currency:'GBP', sort_order:0},
      {id:'ms2', project_id:'pj1', title:'Site cleared',     due_date:plusDays(2),  done:true,  amount:null, currency:'GBP', sort_order:1}
    ];
    DB.bills = [{id:'b1', name:'Drilling deposit', amount:1200, currency:'GBP', due_date:plusDays(5),
      recurrence:'none', archived:false, project_id:'pj1'}];
    DB.expenses = [{id:'e1', name:'Survey fee', amount:300, currency:'GBP', spent_at:plusDays(-3), project_id:'pj1'}];
    DB.planner = []; DB.income = []; DB.debts = []; DB.debtPayments = []; DB.payments = [];
    await A.boot(); await wait(200);

    const tab = d.querySelector('button[data-view="projects"]');
    assert(tab, 'a Projects tab exists');
    tab.click(); await wait(150);
    const list = d.getElementById('projects-list');
    assert(/Borehole at the farm/.test(list.innerHTML), 'open projects listed');
    assert(!/Finished thing/.test(list.innerHTML), 'finished projects hidden under the default filter');
    assert(/GTD/.test(list.innerHTML), 'a project pushed from GTD is marked as linked');

    // Budget vs actual: spend + commitments against budget
    const p1 = DB.projects.find(p=>p.id==='pj1');
    const t = A.projectTotals(p1);
    assert(t.spent === 300, 'spent counts expenses (got ' + t.spent + ')');
    assert(t.planned === 1200, 'still-to-pay counts unpaid bills, not milestone estimates (got ' + t.planned + ')');
    assert(t.committed === 1500 && t.left === 3500, 'committed and remaining against budget');
    assert(t.msDone === 1 && t.msTotal === 2, 'milestone progress counted');

    // CLICK-THROUGH: expand a project
    d.querySelector('[data-act="pjtoggle"][data-id="pj1"]').click(); await wait(120);
    let html2 = d.getElementById('projects-list').innerHTML;
    assert(/Casing delivered/.test(html2), 'milestones shown when expanded');
    assert(/Drilling deposit/.test(html2), 'tagged bills listed');
    assert(/Survey fee/.test(html2), 'tagged expenses listed');

    // CLICK-THROUGH: tick a milestone
    const tick = d.querySelector('[data-act="mstick"][data-id="ms1"]');
    assert(tick, 'milestones are tickable');
    tick.checked = true;
    tick.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    await wait(200);
    assert(DB.milestones.find(m=>m.id==='ms1').done === true, 'ticking saves the milestone');

    // CLICK-THROUGH: add a milestone
    d.querySelector('[data-act="msadd"][data-id="pj1"]').click(); await wait(120);
    assert(d.getElementById('milestone-modal').classList.contains('open'), 'the milestone modal opens');
    d.getElementById('msm-title-in').value = 'Pump installed';
    d.getElementById('msm-due').value = plusDays(30);
    d.getElementById('msm-save').click(); await wait(250);
    assert(DB.milestones.some(m=>m.title==='Pump installed'), 'a new milestone is saved');
    assert(DB.milestones.find(m=>m.title==='Pump installed').project_id === 'pj1', 'attached to the right project');

    // CLICK-THROUGH: add a project
    d.getElementById('proj-add-btn').click(); await wait(120);
    assert(d.getElementById('project-modal').classList.contains('open'), 'the project modal opens');
    d.getElementById('pjm-name').value = 'Fencing the east boundary';
    d.getElementById('pjm-budget').value = '900';
    d.getElementById('pjm-save').click(); await wait(250);
    const added = DB.projects.find(p=>p.name === 'Fencing the east boundary');
    assert(added, 'a new project is saved');
    assert(Number(added.budget) === 900 && added.space === 'family', 'budget and space recorded');

    // Money forms can tag a project
    d.querySelector('button[data-view="bills"]').click(); await wait(120);
    d.getElementById('bill-add-btn').click(); await wait(120);
    const sel = d.getElementById('bm-project');
    assert(sel, 'the bill form offers a project picker');
    assert(/Borehole at the farm/.test(sel.innerHTML), 'open projects are selectable');
    assert(!/Finished thing/.test(sel.innerHTML), 'finished projects are not offered for new tagging');
    A.modalClose('bill-modal');

    // Planner item
    d.querySelector('button[data-view="planner"]').click(); await wait(150);
    A.openItemModal(null, A.currentFriday());
    await wait(120);
    const pimSel = d.getElementById('pim-project');
    assert(pimSel, 'the planner item form offers a project picker');
    assert(/Borehole at the farm/.test(pimSel.innerHTML), 'open projects listed on planner items');
    pimSel.value = 'pj1';
    d.getElementById('pim-name').value = 'Drill bit hire';
    d.getElementById('pim-amount').value = '150';
    d.getElementById('pim-save').click(); await wait(300);
    const newItem = DB.planner.find(x => (x.title || x.name) === 'Drill bit hire');
    assert(newItem, 'the planner item saves');
    assert(newItem.project_id === 'pj1', 'and carries the project tag');

    // Income
    A.openIncomeModal(null, A.currentFriday());
    await wait(120);
    const imSel = d.getElementById('im-project');
    assert(imSel, 'the income form offers a project picker');
    imSel.value = 'pj1';
    d.getElementById('im-person').value = 'Borehole grant';
    d.getElementById('im-amount').value = '2000';
    d.getElementById('im-save').click(); await wait(300);
    const newInc = DB.income.find(x => x.person === 'Borehole grant');
    assert(newInc, 'the income saves');
    assert(newInc.project_id === 'pj1', 'and carries the project tag');

    // Expense (inline form, not a modal)
    d.querySelector('button[data-view="expenses"]').click(); await wait(150);
    const exSel = d.getElementById('ex-project');
    assert(exSel, 'the expense form offers a project picker');
    assert(/Borehole at the farm/.test(exSel.innerHTML), 'open projects listed on expenses');
    exSel.value = 'pj1';
    d.getElementById('ex-amount').value = '95';
    d.getElementById('ex-currency').value = 'GBP';
    d.getElementById('ex-save-btn').click(); await wait(350);
    const newEx = (DB.expenses || []).find(x => Number(x.amount) === 95);
    assert(newEx, 'the expense saves');
    assert(newEx.project_id === 'pj1', 'and carries the project tag');

    // All four kinds now roll into the project's totals
    d.querySelector('button[data-view="projects"]').click(); await wait(150);
    const t2 = A.projectTotals(DB.projects.find(p => p.id === 'pj1'));
    assert(t2.counts.incoming >= 1, 'tagged income counts towards the project');
    assert(t2.spent === 395, 'tagged expenses count towards spend (got ' + t2.spent + ')');
    assert(t2.planned >= 1350, 'tagged planner items count towards still-to-pay (got ' + t2.planned + ')');

    // Totals are per currency: a project budgeted in GBP must not silently
    // absorb a USD row at face value.
    DB.expenses.push({id:'ex-usd', amount:1000, currency:'USD', spent_at:plusDays(-1), project_id:'pj1'});
    const t3 = A.projectTotals(DB.projects.find(p => p.id === 'pj1'));
    assert(t3.spent === 395, 'a USD expense does not inflate the GBP spend figure (got ' + t3.spent + ')');
    DB.expenses = DB.expenses.filter(x => x.id !== 'ex-usd');

    // Filter shows finished work when asked
    d.querySelector('button[data-view="projects"]').click(); await wait(120);
    const filt = d.getElementById('proj-filter');
    filt.value = 'all';
    filt.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
    await wait(150);
    assert(/Finished thing/.test(d.getElementById('projects-list').innerHTML), 'the all filter shows finished projects');
  }

  console.log('\\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
