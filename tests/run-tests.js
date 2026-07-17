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

  console.log('\\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
