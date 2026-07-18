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
    assert(A.fmtMoney(10,'ZWG').indexOf('ZWG') === 0, 'fmtMoney ZWG prefix');
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
    assert(Math.abs(A.approxUSD(80,'GBP') - 100) < 0.01, 'approxUSD converts via frankfurter rates');
    assert(A.approxUSD(50,'ZWG') === null, 'ZWG has no rate, returns null gracefully');
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
    const weeks = A.weeksOfMonth(A.state.plMonth);
    DB.income[0].week_date = weeks[0]; DB.planner[0].week_date = weeks[0];
    await A.boot(); await wait(100);
    d.querySelector('#tabs button[data-view="planner"]').click();
    const boardHTML = d.getElementById('pl-board').innerHTML;
    assert(boardHTML.includes('Rodney') && boardHTML.includes('Farm'), 'planner renders income and item cards');
    assert(d.querySelectorAll('#pl-board .wcol').length === weeks.length, 'one column per Friday of month');
    assert(boardHTML.includes('Remaining'), 'weekly remaining shown');

    // move item to week 2 (simulates the drop handler)
    await A.moveCard('item','pl1', weeks[1]); A.renderPlanner();
    const cols = d.querySelectorAll('#pl-board .wcol');
    assert(!cols[0].innerHTML.includes('Farm') && cols[1].innerHTML.includes('Farm'), 'drag-move relocates card to target week');

    // paid tick
    d.querySelector('button[data-act="ptick"][data-id="pl1"]').click(); await wait(60);
    assert(DB.planner[0].paid === true && DB.planner[0].paid_by === UID, 'paid tick persists who marked it');
    assert(d.querySelector('.card.paid') !== null, 'paid card styled as paid');

    // month nav
    const before = d.getElementById('pl-month').textContent;
    d.getElementById('pl-next').click(); await wait(80);
    assert(d.getElementById('pl-month').textContent !== before, 'month navigation changes board');
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
    assert(nw.GBP === 131000, 'net worth = 1000 account + 280000 asset - 150000 debt');
    assert(d.getElementById('nw-headline').innerHTML.includes('131,000'), 'net worth headline rendered');
    assert(d.getElementById('nw-chart').innerHTML.includes('<svg'), 'net worth trend chart drawn from snapshots');
    assert(d.getElementById('nw-series').innerHTML.includes('HSBC') && d.getElementById('nw-series').innerHTML.includes('Mortgage'), 'per-account and per-debt tracking rows rendered');
    // snapshot taken on boot (fm_snap unset -> POST fired), incl networth row
    assert((DB.snapshots||[]).some(r=>r.kind==='account' && r.ref_id==='a1'), 'daily snapshot wrote account row');
    assert((DB.snapshots||[]).some(r=>r.kind==='networth' && Number(r.value)===131000), 'daily snapshot wrote net worth row');
    assert(dom.window.localStorage.getItem('fm_snap') === A.todayISO(), 'snapshot deduped for today');
    // chart helper edge cases
    assert(A.lineChart([{v:1}],100,30,{}).includes('Not enough history'), 'single point shows building message');
    assert(A.lineChart([{v:1},{v:5},{v:3}],100,30,{}).includes('polyline'), 'multi-point series draws polyline');
    // shared Family owner option present in owner selects
    d.getElementById('debt-add-btn').click();
    assert(d.getElementById('dm-owner-member').options[0].textContent.includes('Family (shared'), 'Family shared ownership option available');
  }

  console.log('\\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
