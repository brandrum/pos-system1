
function formatNumNoRs(x){
  const n = Number(String(x||'').replace(/[^0-9.\-]/g,''))||0;
  return n.toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
}

function formatCurrency(value) {
    return 'Rs. ' + Number(value).toLocaleString('en-LK', {minimumFractionDigits: 2});
}

/* ArtGraphX POS v3.0 Offline build
   - All data in localStorage (no fetch)
   - Forgot password simulation (Option B): creates a reset token visible to user; admin can also reset passwords from Settings.
   - Invoice number consumed only on save.
   - SKU-only input, auto-fill product name & price, qty default 1
   - Amount Tendered + Change Due live, calculator modal copies value to Amount Tendered
*/

// storage keys
const K_INV='agx_inv_v3_offline', K_SALES='agx_sales_v3_offline', K_CUST='agx_cust_v3_offline', K_PUR='agx_pur_v3_offline';
const K_SETTINGS='agx_settings_v3_offline', K_USER='agx_user_v3_offline', K_SEQ='agx_seq_v3_offline', K_PWRESET='agx_pwreset_v3_offline';

const defaultSettings = {
  companyName: 'ArtGraphX Book Shop & Communication',
  address: 'No 304/1/1, Manik Agara Rd, Koratota Kaduwela, Sri Lanka, 10640',
  phone: '(+94) 078 630 7700',
  email: 'artgraphx25@gmail.com',
  currencyCode: 'LKR',
  currencyPrefix: 'Rs. ',
  logoDataUrl: ''
};

const defaultUsers = [
  { username:'admin', role:'admin', password:'1234', email:'artgraphx25@gmail.com' },
  { username:'cashier', role:'cashier', password:'0000', email:'' }
];

// helpers
// currency parsing/formatting helpers for text inputs
function parseMoney(str){ if(typeof str==='number') return str; const s=(str||'').toString().replace(/[^0-9.\-]/g,''); const n = Number(s||0); return isNaN(n)?0:n; }

const uid = ()=> Math.random().toString(36).slice(2)+Date.now().toString(36);
const fmtMoney=(v)=>'Rs. '+Number(v||0).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2});
function getSettings(){ return JSON.parse(localStorage.getItem(K_SETTINGS)||'null') || defaultSettings; }
function setSettings(v){ localStorage.setItem(K_SETTINGS, JSON.stringify(v)); }

function ensureInit(){
  if(!localStorage.getItem(K_INV)){
    localStorage.setItem(K_INV, JSON.stringify([
      {id:uid(), category:'Books', name:'CR Book A4', sku:'BK-CR-A4', mrp:400, discount:50, price:350, cost:220, qty:24},
      {id:uid(), category:'Books', name:'Textbook - Grade 6', sku:'BK-TXT-06', mrp:1300, discount:100, price:1200, cost:850, qty:12},
      {id:uid(), category:'Service', name:'Photocopy (per page)', sku:'SRV-PHOTO', mrp:10, discount:0, price:10, cost:0, qty:99999},
    ]));
  }
  if(!localStorage.getItem(K_CUST)){
    localStorage.setItem(K_CUST, JSON.stringify([{id:'cust_cash', name:'Cash', phone:'', email:''}]));
  }
  if(!localStorage.getItem(K_SALES)) localStorage.setItem(K_SALES, JSON.stringify([]));
  if(!localStorage.getItem(K_PUR)) localStorage.setItem(K_PUR, JSON.stringify([]));
  if(!localStorage.getItem(K_SETTINGS)) setSettings(defaultSettings);
  if(!localStorage.getItem(K_USER)) localStorage.setItem(K_USER, JSON.stringify(defaultUsers));
  if(!localStorage.getItem(K_SEQ)) localStorage.setItem(K_SEQ, JSON.stringify({invoice:1}));
  if(!localStorage.getItem(K_PWRESET)) localStorage.setItem(K_PWRESET, JSON.stringify({}));
}
ensureInit();

const db = {
  get inv(){ return JSON.parse(localStorage.getItem(K_INV)||'[]'); }, set inv(v){ localStorage.setItem(K_INV, JSON.stringify(v)); },
  get sales(){ return JSON.parse(localStorage.getItem(K_SALES)||'[]'); }, set sales(v){ localStorage.setItem(K_SALES, JSON.stringify(v)); },
  get cust(){ return JSON.parse(localStorage.getItem(K_CUST)||'[]'); }, set cust(v){ localStorage.setItem(K_CUST, JSON.stringify(v)); },
  get pur(){ return JSON.parse(localStorage.getItem(K_PUR)||'[]'); }, set pur(v){ localStorage.setItem(K_PUR, JSON.stringify(v)); },
  get users(){ return JSON.parse(localStorage.getItem(K_USER)||'[]'); }, set users(v){ localStorage.setItem(K_USER, JSON.stringify(v)); },
  get seq(){ return JSON.parse(localStorage.getItem(K_SEQ)||'{"invoice":1}'); }, set seq(v){ localStorage.setItem(K_SEQ, JSON.stringify(v)); },
  get reset(){ return JSON.parse(localStorage.getItem(K_PWRESET)||'{}'); }, set reset(v){ localStorage.setItem(K_PWRESET, JSON.stringify(v)); },
};

let currentUser = null;
const app = document.getElementById('app');

function layout(contentHTML){
  const s = getSettings();
  const logo = s.logoDataUrl ? `<img src="${s.logoDataUrl}" alt="logo" />` : `<img src="" alt="logo" style="display:none" />`;
  const settingsButton = currentUser?.role==='admin' ? `<button class="nav-btn" data-section="settings">Settings</button>` : '';
  app.innerHTML = `
    <header class="topbar">
      <div class="brand-left">${logo}</div>
      <div class="brand-center">
        <div class="name">${s.companyName}</div>
        <div class="meta">${s.address} • ${s.phone} • ${s.email}</div>
      </div>
      <div class="brand-right">
        <div id="now">--</div>
        <div class="currency">${s.currencyCode} (${s.currencyPrefix.trim()})</div>
      </div>
    </header>
    <main class="wrap">
      <aside class="sidebar">
        <nav>
          <button class="nav-btn active" data-section="dashboard">Dashboard</button>
          <button class="nav-btn" data-section="invoice">Customer Invoice</button>
          <button class="nav-btn" data-section="inventory">Inventory</button>
          <button class="nav-btn" data-section="sales">Sales</button>
          <button class="nav-btn" data-section="purchases">Purchases</button>
          <button class="nav-btn" data-section="customers">Customers</button>
          <button class="nav-btn" data-section="reports">Reports</button>
          ${settingsButton}
          <hr/>
          <button id="exportJson" class="nav-btn small">Export JSON (Backup)</button>
          <label class="nav-btn small file">Import JSON <input id="importFile" type="file" accept="application/json"/></label>
          <hr/>
          <div class="badge">User: ${currentUser?.username || ''} (${currentUser?.role || ''}) <span class="version">• v3.0</span></div>
          <button id="logoutBtn" class="nav-btn small">Logout</button>
        </nav>
      </aside>
      <section id="content" class="content"><div class="main-card">${contentHTML||''}</div></section>
    </main>
    <div class="footer-bar"><div class="left">Copyright © 2025 ArtGraphX. All rights reserved.</div><div class="center">POS System Powered by <span class="powered"><img id="footerLogo" src="${s.logoDataUrl}" alt="logo" style="height:1em;vertical-align:-0.15em;margin-left:6px"/></span></div><div class="right">Version 1.0</div></div>
  `;

  document.querySelectorAll('.nav-btn[data-section]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      show(e.currentTarget.dataset.section);
    });
  });
  document.getElementById('exportJson').addEventListener('click', exportJSON);
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('logoutBtn').addEventListener('click', ()=>{ currentUser=null; renderLogin(); });
  tick(); setInterval(tick,1000);
}

function tick(){ const n=document.getElementById('now'); if(n) n.textContent=new Date().toLocaleString('en-LK'); }

// LOGIN / REGISTER / FORGOT (Option B simulated)
function renderLogin(){
  app.innerHTML = `
    <div class="login-wrap" style="text-align:center">
<img src="${getSettings().logoDataUrl || ""
}" alt="logo" style="max-width:200px;height:auto;border-radius:6px;margin-bottom:14px"/>
      
<div style="margin-bottom:10px"></div>
      <div class="field"><label>Username<input id="u" class="input" placeholder="Username" style="text-align:center;margin-top:4px" style="text-align:center;margin-top:4px" /></label></div>
      <div class="field"><label>Password<input id="p" type="password" style="text-align:center;margin-bottom:20px" class="input" placeholder="Password" style="text-align:center;margin-top:4px" style="text-align:center;margin-top:4px" /></label></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button id="loginBtn" class="btn primary">Login</button>
        <button id="regBtn" class="btn">Create Account</button>
        <button id="fpBtn" class="btn ghost">Forgot password</button>
      </div>
      <div style="margin-top:14px"></div><p class="badge" style="margin-top:8px;text-align:center">Admin can create users and reset passwords locally.</p>
<p style="text-align:center;margin-top:12px"><span style="font-size:12px;color:rgba(0,0,0,0.25)"><span style="font-size:12px;color:rgba(0,0,0,0.25)"><span style="font-size:12px;color:#b6b6b6">Version 7.1</span></span></span></p>
    </div>
  
    <div class="footer-bar">
      <div class="left">Copyright © 2025 ArtGraphX. All rights reserved.</div>
      <div class="center">POS System Powered by <img src="${getSettings().logoDataUrl || 'logo-light-transparent-2.png'}" alt="logo"/></div>
      <div class="right">Version 1.0</div>
    </div>
`;
  document.getElementById('loginBtn').addEventListener('click', ()=>{
    const u = document.getElementById('u').value.trim();
    const p = document.getElementById('p').value;
    const found = db.users.find(x=>x.username===u && x.password===p);
    if(!found) return alert('Invalid credentials');
    currentUser = {username:found.username, role:found.role};
    layout(); show('dashboard'); document.querySelectorAll('.nav-btn').forEach(btn=>{btn.classList.toggle('active', btn.dataset.section==='dashboard');});
  });
  document.getElementById('regBtn').addEventListener('click', renderRegister);
  document.getElementById('fpBtn').addEventListener('click', renderForgotPassword);

  // submit on Enter key
  ['u','p'].forEach(id=>{
    const el = document.getElementById(id);
    el.addEventListener('keydown', (ev)=>{
      if(ev.key==='Enter'){ document.getElementById('loginBtn').click(); }
    });
  });
}

function renderRegister(){
  app.innerHTML = `
    <div class="login-wrap" style="text-align:center">
<img src="${getSettings().logoDataUrl || ""}" alt="logo" style="max-width:200px;height:auto;border-radius:6px;margin-bottom:14px"/>
      <h2>Create Account</h2>
      <div class="field"><label>Username<input id="r_u" class="input"/></label></div>
      <div class="field"><label>Password<input id="r_p" type="password" class="input"/></label></div>
      <div class="field"><label>Role<select id="r_role" class="input"><option value="cashier">Cashier</option><option value="admin">Admin</option></select></label></div>
      <div class="field"><label>Email<input id="r_email" class="input"/></label></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button id="createBtn" class="btn primary">Create</button>
        <button id="backBtn" class="btn ghost">Back</button>
      </div>
      <div style="margin-top:14px"></div><p class="badge" style="margin-top:8px">Accounts stored locally for offline use.</p>
    </div>
  `;
  document.getElementById('createBtn').addEventListener('click', ()=>{
    const u = document.getElementById('r_u').value.trim();
    const p = document.getElementById('r_p').value;
    const role = document.getElementById('r_role').value;
    const email = document.getElementById('r_email').value.trim();
    if(!u||!p) return alert('Username and password required');
    if(db.users.find(x=>x.username===u)) return alert('Username exists');
    const users = db.users; users.unshift({username:u, password:p, role, email}); db.users = users;
    alert('Account created. You can login now.'); renderLogin();
  });
  document.getElementById('backBtn').addEventListener('click', renderLogin);
}

function renderForgotPassword(){
  // Simulated offline flow: user provides email -> token generated and shown -> user uses token to reset
  app.innerHTML = `
    <div class="login-wrap" style="text-align:center">
<img src="${getSettings().logoDataUrl || ""}" alt="logo" style="max-width:200px;height:auto;border-radius:6px;margin-bottom:14px"/>
      <h2>Reset password (offline)</h2>
      <div class="field"><label>Email<input id="fp_email" class="input" placeholder="Enter account email"/></label></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button id="sendReset" class="btn primary">Generate reset token</button>
        <button id="backBtn" class="btn ghost">Back</button>
      </div>
      <div style="margin-top:14px"></div><p class="badge" style="margin-top:8px">A reset token will be generated here (offline). Use it to set a new password.</p>
    </div>
  `;
  document.getElementById('sendReset').addEventListener('click', ()=>{
    const email = document.getElementById('fp_email').value.trim();
    if(!email) return alert('Enter email');
    const user = db.users.find(u=>u.email===email);
    if(!user) return alert('No account with this email in local data');
    const token = Math.random().toString(36).slice(2,9).toUpperCase();
    const reset = db.reset; reset[token] = { username:user.username, expires: Date.now()+ (1000*60*60) }; db.reset = reset;
    alert(`Reset token (offline): ${token}\nUse 'Use reset token' screen to set a new password.`);
    renderResetWithToken(token);
  });
  document.getElementById('backBtn').addEventListener('click', renderLogin);
}

function renderResetWithToken(prefillToken=''){
  app.innerHTML = `
    <div class="login-wrap" style="text-align:center">
<img src="${getSettings().logoDataUrl || ""}" alt="logo" style="max-width:200px;height:auto;border-radius:6px;margin-bottom:14px"/>
      <h2>Use reset token</h2>
      <div class="field"><label>Token<input id="rt_token" class="input" value="${prefillToken}"/></label></div>
      <div class="field"><label>New Password<input id="rt_pw" type="password" class="input"/></label></div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button id="doReset" class="btn primary">Reset password</button>
        <button id="backBtn" class="btn ghost">Back</button>
      </div>
    </div>
  `;
  document.getElementById('doReset').addEventListener('click', ()=>{
    const token = document.getElementById('rt_token').value.trim();
    const pw = document.getElementById('rt_pw').value;
    const reset = db.reset;
    if(!reset[token]) return alert('Invalid token');
    if(reset[token].expires < Date.now()) return alert('Token expired');
    const username = reset[token].username;
    const users = db.users;
    const u = users.find(x=>x.username===username);
    if(!u) return alert('User not found');
    u.password = pw; db.users = users;
    delete reset[token]; db.reset = reset;
    alert('Password reset. You can login now.');
    renderLogin();
  });
  document.getElementById('backBtn').addEventListener('click', renderLogin);
}

// NAV & UI
function show(section){
  const routes = {
    'dashboard': renderDashboard,
    'invoice': renderInvoice,
    'inventory': renderInventory,
    'sales': renderSales,
    'purchases': renderPurchases,
    'customers': renderCustomers,
    'reports': renderReports,
    'settings': renderSettings,
  };
  (routes[section]||renderDashboard)();
}

function layoutAfterLogin(){
  layout();
  show('dashboard'); document.querySelectorAll('.nav-btn').forEach(btn=>{btn.classList.toggle('active', btn.dataset.section==='dashboard');});
}

// Dashboard (top 5 fast moving, pie for today, low stock box separate)
function renderDashboard(){
  const inv = db.inv, sales = db.sales;
  const today = (()=>{const d=new Date(); d.setHours(0,0,0,0); return d;})();
  const wk = (()=>{const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d;})();
  const mo = (()=>{const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;})();

  const todays = sales.filter(s=> new Date(s.date) >= today);
  const weekSales = sales.filter(s=> new Date(s.date) >= wk);
  const monthSales = sales.filter(s=> new Date(s.date) >= mo);

  const sum = arr => arr.reduce((a,b)=>a+b.total,0);
  const sumCost = arr => arr.reduce((a,b)=>a+b.costTotal,0);

  const tGross = sum(todays), tCost=sumCost(todays), tProfit=tGross-tCost;
  const wGross = sum(weekSales), wCost=sumCost(weekSales), wProfit=wGross-wCost;
  const mGross = sum(monthSales), mCost=sumCost(monthSales), mProfit=mGross-mCost;

  const qtyByItem = {};
  weekSales.forEach(s=> s.items.forEach(l=> qtyByItem[l.name]=(qtyByItem[l.name]||0)+l.qty ));
  const top5 = Object.entries(qtyByItem).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const totByCust = {};
  monthSales.forEach(s=> totByCust[s.customerName]=(totByCust[s.customerName]||0)+s.total );
  const bestCust = Object.entries(totByCust).sort((a,b)=>b[1]-a[1])[0];

  const low = inv.filter(i=> i.qty<=3);

  document.getElementById('content').innerHTML = `
    <div class="main-card">
      <div class="grid cols-4">
        <div class="card kpi"><div class="title">Today's Sales</div><div class="value">${fmtMoney(tGross)}</div></div>
        <div class="card kpi"><div class="title">Today's Cost</div><div class="value">${fmtMoney(tCost)}</div></div>
        <div class="card kpi"><div class="title">Today's Profit</div><div class="value">${fmtMoney(tProfit)}</div></div>
        <div class="card kpi"><div class="title">Fast Moving (7d)</div><div class="value" style="font-size:12px;font-weight:400">${top5.length? top5.map((x,i)=>`${i+1}. ${x[0]} × ${x[1]}`).join('<br/>') : '—'}</div></div>
      </div>

      <div class="grid cols-3" style="margin-top:12px">
        <div class="card">
          <h3 style="margin:0 0 8px 0">Today — Sales Mix</h3>
          <div class="chart" id="pieToday"></div>
        </div>
        <div class="card">
          <h3 style="margin:0 0 8px 0">Weekly vs Profit</h3>
          <div class="chart" id="barWeek"></div>
        </div>
        <div class="${low.length? 'card low-box' : 'card'}">
          <h3 style="margin:0 0 8px 0">Low Stock (≤ 3)</h3>
          ${ low.length ? `<ul>${low.map(i=>`<li class="low">${i.name} — ${i.qty}</li>`).join('')}</ul>` : '<p>No low stock.</p>' }
        </div>
      </div>

      <div class="grid cols-4" style="margin-top:12px"><div class="card kpi"><div class="title">Weekly Sales</div><div class="value smallval">${fmtMoney(wGross)}</div></div><div class="card kpi"><div class="title">Weekly Profit</div><div class="value smallval">${fmtMoney(wProfit)}</div></div><div class="card kpi"><div class="title">Monthly Sales</div><div class="value smallval">${fmtMoney(mGross)}</div></div><div class="card kpi"><div class="title">Monthly Profit</div><div class="value smallval">${fmtMoney(mProfit)}</div></div></div>
    </div>
  `;

  // pie and bars
  const pieData = {};
  todays.forEach(s=> s.items.forEach(l=> pieData[l.name]=(pieData[l.name]||0)+l.qty ));
  drawPie(document.getElementById('pieToday'), pieData);

  const dayMap = {};
  for(let i=0;i<7;i++){ const d=new Date(startOfWeek()); d.setDate(d.getDate()+i); const key=d.toISOString().slice(0,10); dayMap[key]={sales:0,cost:0,label:d.toLocaleDateString('en-LK',{weekday:'short'})}; }
  weekSales.forEach(s=>{ const key=new Date(s.date).toISOString().slice(0,10); if(dayMap[key]){ dayMap[key].sales+=s.total; dayMap[key].cost+=s.costTotal; } });
  drawBars(document.getElementById('barWeek'), Object.values(dayMap).map(d=>({label:d.label,sales:d.sales,profit:d.sales-d.cost})));
}

function drawPie(el,dataObj){ const entries=Object.entries(dataObj); if(!entries.length){ el.innerHTML='<div style="padding:12px;color:#9aa3b2">No data today.</div>'; return; } const total=entries.reduce((a,[,v])=>a+v,0); let acc=0; const colors=['#ef4444','#2563eb','#ef6666','#3b82f6','#a78bfa','#22d3ee','#f472b6']; const arcs=entries.map(([k,v],i)=>{ const start=(acc/total)*Math.PI*2; acc+=v; const end=(acc/total)*Math.PI*2; const x1=50+45*Math.cos(start), y1=50+45*Math.sin(start); const x2=50+45*Math.cos(end), y2=50+45*Math.sin(end); const large=(end-start)>Math.PI?1:0; const d=`M50,50 L${x1},${y1} A45,45 0 ${large} 1 ${x2},${y2} Z`; return `<path d="${d}" fill="${colors[i%colors.length]}" opacity="0.95"><title>${k}: ${v}</title></path>`; }).join(''); el.innerHTML=`<svg viewBox="0 0 100 100">${arcs}</svg>`; }
function drawBars(el,arr){ if(!arr.length){ el.innerHTML='<div style="padding:12px;color:#9aa3b2">No data.</div>'; return; } const max=Math.max(...arr.flatMap(d=>[d.sales,d.profit,1])); const bw=100/(arr.length*2+1); let x=bw; const bars=arr.map((d,i)=>{ const hs=(d.sales/max)*80, hp=(d.profit/max)*80; const yS=90-hs, yP=90-hp; const xs=x, xp=x+bw; const labelX=x; x+=bw*2; return `<rect x="${xs}" y="${yS}" width="${bw-2}" height="${hs}" fill="#60a5fa"><title>${d.label} Sales: ${d.sales}</title></rect><rect x="${xp}" y="${yP}" width="${bw-2}" height="${hp}" fill="#34d399"><title>${d.label} Profit: ${d.profit}</title></rect><text x="${labelX+bw/2}" y="98" font-size="3" text-anchor="middle" fill="#cbd5e1">${d.label}</text>`}).join(''); el.innerHTML=`<svg viewBox="0 0 100 100"><g>${bars}</g></svg>`; }

// Inventory, Purchases, Customers, Sales (simplified UI)

function renderInventory(){
  const inv=db.inv;
  content.innerHTML=`
    <div class="card">
      <h2>Add Product</h2>
      <div class="form-row">
        <div class="field"><label>Category <input id="inv_category" class="input" placeholder="e.g., Books"></label></div>
        <div class="field"><label>Item Name <input id="inv_name" class="input"></label></div>
        <div class="field"><label>SKU No. <input id="inv_sku" class="input"></label></div>
      </div>
      <div class="form-row">
        <div class="field"><label>MRP <input id="inv_mrp" class="input" type="number"></label></div>
        <div class="field"><label>Discount <input id="inv_discount" class="input" type="number" value="0"></label></div>
        <div class="field"><label>Unit Price <input id="inv_price" class="input" type="number"></label></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Cost Price <input id="inv_cost" class="input" type="number"></label></div>
        <div class="field"><label>Available Stock <input id="inv_qty" class="input" type="number"></label></div>
      </div>
      <div class="form-row button-row">
        <button class="btn primary" id="inv_add">Add Item</button>
        <button class="btn" id="inv_export_all">Export All Inventory</button>
        <input type="file" id="inv_import_file" accept=".csv" style="display:none" />
        <button class="btn" id="inv_import_btn">Import Products (CSV)</button>
      </div>
    </div>

    <div class="card" style="margin-top:15px">
      <h2>Search Inventory</h2>
      <div class="form-row" style="margin-top:8px; align-items:center">
        <div class="field" style="min-width:260px">
          <label>Search (Category / Item / SKU)
            <input id="inv_search" class="input" placeholder="Type to search..." />
          </label>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="btn primary" id="inv_search_btn">Search / View</button>
          <button class="btn" id="inv_clear_btn">Clear</button>
        </div>
      </div>
      <div style="margin-top:8px">
        <button class="btn" id="inv_export_excel">Export to Excel</button>
        <button class="btn" id="inv_export_pdf">Export to PDF</button>
      </div>
      <div id="inv_table" style="margin-top:10px"></div>
    </div>
    `;

  const tbl=document.getElementById('inv_table'); 
  tbl.innerHTML = '<p>Enter a search term above and click Search to view products.</p>';

  const btn = document.getElementById('inv_search_btn');
  const btnClear = document.getElementById('inv_clear_btn');
  const btnExcel = document.getElementById('inv_export_excel');
  const btnPDF = document.getElementById('inv_export_pdf');
  const btnExportAll = document.getElementById('inv_export_all');
  const btnImport = document.getElementById('inv_import_btn');
  const fileInput = document.getElementById('inv_import_file');
  const input = document.getElementById('inv_search');
// --- Autocomplete dropdown: created dynamically so no HTML changes needed ---
(function() {
  try {
    const parent = input && input.parentElement;
    if (!parent) return;

    // Make parent relatively positioned to anchor the dropdown
    if (getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }

    // Create suggestions container if not present
    let suggestions = document.getElementById('search_suggestions');
    if (!suggestions) {
      suggestions = document.createElement('div');
      suggestions.id = 'search_suggestions';
      suggestions.className = 'suggestions';
      suggestions.style.minWidth = (input.offsetWidth || 200) + 'px';
      parent.appendChild(suggestions);
    }

    // Live search: update results as you type
    input.addEventListener('input', () => {
      const q = (input.value || '').trim().toLowerCase();
      if (!q) {
        suggestions.style.display = 'none';
        doSearch(); // show all or clear list
        return;
      }
      const matches = (Array.isArray(inv) ? inv : []).filter(it =>
        (it.name && String(it.name).toLowerCase().includes(q)) ||
        (it.sku && String(it.sku).toLowerCase().includes(q)) ||
        (it.category && String(it.category).toLowerCase().includes(q))
      ).slice(0, 10);

      // Build suggestion items
      suggestions.innerHTML = '';
      matches.forEach(it => {
        const row = document.createElement('div');
        row.className = 'suggestion-item';
        const skuText = it.sku ? ` (${it.sku})` : '';
        row.textContent = `${it.name || ''}`.trim();
        row.addEventListener('mousedown', (e) => {
          // mousedown so it fires before blur hides the list
          e.preventDefault();
          input.value = it.name || it.sku || '';
          suggestions.style.display = 'none';
          doSearch();
        });
        suggestions.appendChild(row);
      });
      suggestions.style.display = matches.length ? 'block' : 'none';
    });

    // Hide on blur/click outside
    document.addEventListener('click', (ev) => {
      if (!suggestions.contains(ev.target) && ev.target !== input) {
        suggestions.style.display = 'none';
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { suggestions.style.display = 'none'; }, 120);
    });
    // Allow Escape to close
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        suggestions.style.display = 'none';
        input.blur();
      }
    });
  } catch (e) {
    console.error('Autocomplete init failed:', e);
  }

  const btnAdd = document.getElementById('inv_add');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const category = document.getElementById('inv_category').value.trim();
      const name = document.getElementById('inv_name').value.trim();
      const sku = document.getElementById('inv_sku').value.trim();
      const mrp = parseFloat(document.getElementById('inv_mrp').value) || 0;
      const discount = parseFloat(document.getElementById('inv_discount').value) || 0;
      const price = parseFloat(document.getElementById('inv_price').value) || (mrp - discount);
      const cost = parseFloat(document.getElementById('inv_cost').value) || 0;
      const qty = parseInt(document.getElementById('inv_qty').value) || 0;

      if (!name || !sku) {
        alert("⚠️ Item Name and SKU are required.");
        return;
      }

      const item = { id: uid(), category, name, sku, mrp, discount, price, cost, qty };
      const invList = db.inv;
      invList.unshift(item);
      db.inv = invList;

      alert("✅ Product added to inventory!");

      document.getElementById('inv_category').value = '';
      document.getElementById('inv_name').value = '';
      document.getElementById('inv_sku').value = '';
      document.getElementById('inv_mrp').value = '';
      document.getElementById('inv_discount').value = '0';
      document.getElementById('inv_price').value = '';
      document.getElementById('inv_cost').value = '';
      document.getElementById('inv_qty').value = '';
    });
  }

})();


  let lastResults = [];

  function doSearch(){
    const q = (input.value||'').toLowerCase().trim();
    if(!q){ tbl.innerHTML='<p>Enter a search term to view products.</p>'; lastResults=[]; return; }
    const list = inv.filter(i =>
      (i.category||'').toLowerCase().includes(q) ||
      (i.name||'').toLowerCase().includes(q) ||
      (i.sku||'').toLowerCase().includes(q)
    );
    lastResults = list;
    if(list.length===0){ tbl.innerHTML='<p>No matching inventory.</p>'; return; }
    tbl.innerHTML = `
      <table class="table" id="inv_results_table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Item Name</th>
            <th>SKU No.</th>
            <th>MRP</th>
            <th>Discount</th>
            <th>Unit Price</th>
            <th>Cost Price</th>
            <th>Total Cost Price</th>
            <th>Available Stock</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(i => `
            <tr>
              <td>${i.category || ''}</td>
              <td>${i.name || ''}</td>
              <td>${i.sku || ''}</td>
              <td>${fmtMoney(i.mrp || 0)}</td>
              <td>${fmtMoney(i.discount || 0)}</td>
              <td>${fmtMoney(i.price || 0)}</td>
              <td>${fmtMoney(i.cost || 0)}</td>
              <td>${fmtMoney((i.cost || 0) * (i.qty || 0))}</td>
              <td>${i.qty || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  }

  function exportToExcel(){
    if(lastResults.length===0){ alert('No data to export'); return; }
    let csv = 'Category,Item Name,SKU No.,MRP,Discount,Unit Price,Cost Price,Total Cost Price,Available Stock\n';
    lastResults.forEach(i=>{
      csv += `"${i.category||''}","${i.name||''}","${i.sku||''}",${i.mrp||0},${i.discount||0},${i.price||0},${i.cost||0},${(i.cost||0)*(i.qty||0)},${i.qty||0}\n`;
    });
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportAll(){
    if(inv.length===0){ alert('No inventory to export'); return; }
    let csv = 'Category,Item Name,SKU No.,MRP,Discount,Unit Price,Cost Price,Available Stock\n';
    inv.forEach(i=>{
      csv += `"${i.category||''}","${i.name||''}","${i.sku||''}",${i.mrp||0},${i.discount||0},${i.price||0},${i.cost||0},${i.qty||0}\n`;
    });
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_full_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importCSV(file){
    const reader = new FileReader();
    reader.onload = function(e){
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
      for(let i=1;i<lines.length;i++){
        const parts = lines[i].split(',');
        if(parts.length<8) continue;
        const item = {
          category: parts[0].replace(/"/g,'').trim(),
          name: parts[1].replace(/"/g,'').trim(),
          sku: parts[2].replace(/"/g,'').trim(),
          mrp: parseFloat(parts[3])||0,
          discount: parseFloat(parts[4])||0,
          price: parseFloat(parts[5])||0,
          cost: parseFloat(parts[6])||0,
          qty: parseInt(parts[7])||0
        };
        inv.push(item);
      }
      save();
      alert('Products imported successfully!');
    };
    reader.readAsText(file);
  }

  function exportToPDF(){
    if(lastResults.length===0){ alert('No data to export'); return; }
    let win = window.open('', '', 'height=700,width=900');
    win.document.write('<html><head><title>Inventory Export</title></head><body>');
    win.document.write('<h2>Inventory Export</h2>');
    win.document.write('<table border="1" style="border-collapse:collapse;width:100%"><tr><th>Category</th><th>Item Name</th><th>SKU No.</th><th>MRP</th><th>Discount</th><th>Unit Price</th><th>Cost Price</th><th>Total Cost Price</th><th>Available Stock</th></tr>');
    lastResults.forEach(i=>{
      win.document.write('<tr>');
      win.document.write('<td>'+ (i.category||'') +'</td>');
      win.document.write('<td>'+ (i.name||'') +'</td>');
      win.document.write('<td>'+ (i.sku||'') +'</td>');
      win.document.write('<td>'+ fmtMoney(i.mrp||0) +'</td>');
      win.document.write('<td>'+ fmtMoney(i.discount||0) +'</td>');
      win.document.write('<td>'+ fmtMoney(i.price||0) +'</td>');
      win.document.write('<td>'+ fmtMoney(i.cost||0) +'</td>');
      win.document.write('<td>'+ fmtMoney((i.cost||0)*(i.qty||0)) +'</td>');
      win.document.write('<td>'+ (i.qty||0) +'</td>');
      win.document.write('</tr>');
    });
    win.document.write('</table></body></html>');
    win.document.close();
    win.print();
  }

  if(btn) btn.addEventListener('click', doSearch);
  if(input) input.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); doSearch(); } });
  if(btnClear) btnClear.addEventListener('click', ()=>{ input.value=''; tbl.innerHTML='<p>Enter a search term above and click Search to view products.</p>'; lastResults=[]; });
  if(btnExcel) btnExcel.addEventListener('click', exportToExcel);
  if(btnPDF) btnPDF.addEventListener('click', exportToPDF);
  if(btnExportAll) btnExportAll.addEventListener('click', exportAll);
  if(btnImport) btnImport.addEventListener('click', ()=> fileInput.click());
  if(fileInput) fileInput.addEventListener('change', ev=>{ if(ev.target.files.length>0) importCSV(ev.target.files[0]); });
}
function renderPurchases(){ const inv=db.inv; const canEdit=currentUser?.role==='admin'; const pur=db.pur; document.getElementById('content').innerHTML=`<div class="card"><h3>Purchase Management</h3>${ canEdit?`<div class="form-row"><div class="field"><label>Product<select id="pu_sel" class="input">${inv.map(i=>`<option value="${i.id}">${i.name}</option>`).join('')}</select></label></div><div class="field"><label>Qty<input id="pu_qty" type="number" class="input" value="1" /></label></div><div class="field"><label>Cost per unit<input id="pu_cost" type="number" class="input" value="0" /></label></div><div><button class="btn primary" style="height:40px;display:flex;align-items:center;justify-content:center" id="pu_add">Add Purchase</button></div></div>`:'<div class="badge">Cashier can view purchases only</div>'}<div id="pu_list" style="margin-top:10px"></div></div>`; if(canEdit){ document.getElementById('pu_add').addEventListener('click', ()=>{ const id=document.getElementById('pu_sel').value; const qty=Number(document.getElementById('pu_qty').value||0); const cost=Number(document.getElementById('pu_cost').value||0); if(qty<=0||cost<0) return alert('Enter valid qty/cost'); const item=db.inv.find(x=>x.id===id); if(!item) return; item.qty+=qty; if(cost>0) item.cost=cost; db.inv=db.inv; const p=db.pur; p.unshift({id:uid(),date:new Date().toISOString(),productId:id,name:item.name,qty,cost}); db.pur=p; renderPurchases(); }); } document.getElementById('pu_list').innerHTML= pur.length? `<table class="table"><thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>Cost</th></tr></thead><tbody>${pur.map(p=>`<tr><td>${new Date(p.date).toLocaleString()}</td><td>${p.name}</td><td>${p.qty}</td><td>${fmtMoney(p.cost)}</td></tr>`).join('')}</tbody></table>`: '<p>No purchases yet.</p>'; }

function renderCustomers(){ const canEdit=currentUser?.role==='admin'; const cust=db.cust; document.getElementById('content').innerHTML=`<div class="card"><h3>Customer Management</h3><div class="form-row"><div class="field"><label>Name<input id="cu_name" class="input"/></label></div><div class="field"><label>Phone<input id="cu_phone" class="input"/></label></div><div class="field"><label>Email<input id="cu_email" class="input"/></label></div><div><button class="btn primary" style="height:40px;display:flex;align-items:center;justify-content:center" id="cu_add">Add Customer</button></div></div><div id="cu_list" style="margin-top:10px"></div></div>`; document.getElementById('cu_add').addEventListener('click', ()=>{ if(currentUser?.role!=='admin') return alert('Admin only'); const name=val('cu_name'); if(!name) return alert('Name required'); const c={id:uid(),name,phone:val('cu_phone'),email:val('cu_email')}; const list=db.cust; list.unshift(c); db.cust=list; renderCustomers(); }); document.getElementById('cu_list').innerHTML= cust.length? `<table class="table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead><tbody>${cust.map(c=>`<tr><td>${c.name}</td><td>${c.phone}</td><td>${c.email}</td></tr>`).join('')}</tbody></table>`: '<p>No customers yet.</p>'; }

function renderSales(){ const sales=db.sales; document.getElementById('content').innerHTML=`<div class="card"><h3>Sales</h3>${ sales.length===0 ? '<p>No sales yet.</p>' : `<table class="table"><thead><tr><th>Inv #</th><th>Date</th><th>Customer</th><th>Total</th><th></th></tr></thead><tbody>${sales.map(s=>`<tr><td>${s.invNo}</td><td>${new Date(s.date).toLocaleString()}</td><td>${s.customerName}</td><td>${fmtMoney(s.total)}</td><td><button class="btn ghost" style="height:40px;display:flex;align-items:center;justify-content:center" onclick="viewSale('${s.id}')">Open</button></td></tr>`).join('')}</tbody></table>` }</div>`; }
window.viewSale=function(id){ const s=db.sales.find(x=>x.id===id); if(!s) return alert('Sale not found'); showInvoiceView(s); };

function renderReports(){ const sales=db.sales, inv=db.inv; const totalSales=sales.reduce((a,b)=>a+b.total,0); const totalCost=sales.reduce((a,b)=>a+b.costTotal,0); const profit=totalSales-totalCost; const stockRetail=inv.reduce((a,b)=>a+(b.price*b.qty),0); const stockCost=inv.reduce((a,b)=>a+(b.cost*b.qty),0); document.getElementById('content').innerHTML=`<div class="card"><h3>Reports & Analytics</h3><div class="grid cols-3"><div class="card kpi"><div class="title">Total Sales</div><div class="value">${fmtMoney(totalSales)}</div></div><div class="card kpi"><div class="title">Total Cost</div><div class="value">${fmtMoney(totalCost)}</div></div><div class="card kpi"><div class="title">Profit</div><div class="value">${fmtMoney(profit)}</div></div></div><div class="card" style="margin-top:12px"><h4 style="margin:0 0 8px 0">Stock Valuation</h4><p>Retail: <b>${fmtMoney(stockRetail)}</b> • Cost: <b>${fmtMoney(stockCost)}</b></p></div></div>`; }

// invoice helpers
function peekInvoiceNo(){ const seq=db.seq; return String(seq.invoice||1).padStart(5,'0'); }
function nextInvoiceNo(){ const seq=db.seq; const n=seq.invoice||1; seq.invoice=n+1; db.seq=seq; return String(n).padStart(5,'0'); }

function startOfWeek(){ const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d; }

// Invoice UI (SKU-only entry, fields blank at start)
function renderInvoice(){
  const inv=db.inv, cust=db.cust;
  const invNoPeek = peekInvoiceNo();
  window._cart = [];
  document.getElementById('content').innerHTML = `
    <div class="card">
      <h3>Customer Invoice <span class="badge">Inv # ${invNoPeek}</span></h3>
      <div class="form-row">
        <div class="field"><label>Customer<select id="c_sel" class="input">${cust.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}<option value="new">+ New customer</option></select></label></div>
        <div class="field"><label>Customer Name (if new)<input id="c_name" class="input" placeholder="Name"/></label></div>
        <div class="field"><label>Mobile (if new)<input id="c_phone" class="input" placeholder="07X"/></label></div>
      </div>

      <div class="form-row" style="margin-top:8px">
        <div class="field"><label>SKU Number<input id="sku_in" class="input" placeholder="Enter or scan SKU" / readonly></label></div>
        <div class="field"><label>Product Name<input id="p_name" class="input" placeholder="Type to search" /></label></div>
        <div class="field"><label>Qty<input id="p_qty" type="number" class="input" value="1" min="1" /></label></div>
      </div>

      <div class="form-row" style="margin-top:6px">
        <div class="field"><label>MRP<input id="p_mrp" class="input currency-lkr" value="0.00" / readonly></label></div>
        <div class="field"><label>Discount<input id="p_disc" class="input currency-lkr" value="0.00" /></label></div>
        <div class="field"><label>Unit Price<input id="p_price" class="input currency-lkr" value="0.00" /></label></div>
      </div>

      <div id="cart_area" style="margin-top:12px"></div>

      <div class="form-row" style="margin-top:12px">
        <div class="field"><label>Notes<input id="notes" class="input" placeholder="Notes (optional)" /></label></div>
        <div class="field"><label>Amount Tendered<input id="cash_given" class="input currency-lkr" value="0.00" /></label></div>
        <div class="field"><label>Change Due<input id="change_due" class="input currency-lkr" readonly value="0.00"/></label></div>
        <div style="display:flex;align-items:end"></div>
      </div>

      <div class="invoice-actions">
        <button class="btn primary" id="add_line">Add</button>
        <button class="btn primary" id="save_inv">Save</button>
        <button class="btn" id="print_inv">Print</button>
        <button class="btn ghost" id="close_inv">Close</button>
        <button class="btn" id="open_calc">Calc</button>
      </div>
    </div>

    <div id="calc_modal" style="display:none" class="calc-modal"><div class="calc-display" id="calc_display">0</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
        <button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="7">7</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="8">8</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="9">9</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-op="/">/</button>
        <button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="4">4</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="5">5</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="6">6</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-op="*">*</button>
        <button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="1">1</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="2">2</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="3">3</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-op="-">-</button>
        <button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val="0">0</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-val=".">.</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" id="calc_eq" class="btn">=</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" data-op="+">+</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" id="calc_copy">Copy</button><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" id="calc_close">Close</button></div>
    </div>
  `;
  // customer autofill & new customer toggle
  const sel=document.getElementById('c_sel');
  const nameF=document.getElementById('c_name');
  const phoneF=document.getElementById('c_phone');
  function syncCustomer(){
    const id=sel.value;
    if(id==='new'){
      nameF.value=''; phoneF.value=''; nameF.readOnly=false; phoneF.readOnly=false;
    }else{
      const c=db.cust.find(x=>x.id===id) || {name:'',phone:''};
      nameF.value=c.name||''; phoneF.value=c.phone||''; nameF.readOnly=true; phoneF.readOnly=true;
    }
  }
  sel.addEventListener('change', syncCustomer); syncCustomer();

  // simple autocomplete for SKU & Product Name
  function makeAutocomplete(input, setFrom){
    let list;
    input.addEventListener('input', ()=>{
      const q=input.value.trim().toLowerCase();
      const matches=db.inv.filter(it=> (it.sku||'').toLowerCase().includes(q) || (it.name||'').toLowerCase().includes(q)).slice(0,6);
      if(!list){ list=document.createElement('div'); list.className='autocomplete'; if (input && input.id) { list.setAttribute('data-for', input.id); } document.body.appendChild(list);
      // close dropdown if clicking outside
      document.addEventListener('click', (e) => {
        if (list && !list.contains(e.target) && e.target !== input) {
          list.innerHTML = '';
        }
      });
      // close dropdown on ESC key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && list) {
          list.innerHTML = '';
        }
      });
      // close dropdown on TAB key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && list) {
          list.innerHTML = '';
        }
      });
 }
      const r=input.getBoundingClientRect(); list.style.left=r.left+'px'; list.style.top=(r.bottom+window.scrollY)+'px'; list.style.width=r.width+'px';
      list.innerHTML='';
      matches.forEach(m=>{
        const item=document.createElement('div'); item.className='ac-item'; item.textContent=(m.sku||'')+' — '+m.name; item.onclick=()=>{ setFrom(m); list.innerHTML=''; };
        list.appendChild(item);
      });
    });
  }
  makeAutocomplete(document.getElementById('sku_in'), (m)=>{ document.getElementById('sku_in').value=m.sku||''; document.getElementById('p_name').value=m.name||'';         document.getElementById('p_mrp').value = formatNumNoRs(m.mrp || 0);
    document.getElementById('p_mrp').value = formatNumNoRs(m.mrp || 0);
    document.getElementById('p_price').value = formatNumNoRs((m.price!=null?m.price:((m.mrp||0)-(m.discount||0)))); document.getElementById('p_disc').value = formatNumNoRs((m.disc!=null?m.disc:(m.discount||0))); document.getElementById('p_qty').value=1; });
  makeAutocomplete(document.getElementById('p_name'), (m)=>{ document.getElementById('sku_in').value=m.sku||''; document.getElementById('p_name').value=m.name||'';         document.getElementById('p_mrp').value = formatNumNoRs(m.mrp || 0);
    document.getElementById('p_mrp').value = formatNumNoRs(m.mrp || 0);
    document.getElementById('p_price').value = formatNumNoRs((m.price!=null?m.price:((m.mrp||0)-(m.discount||0)))); document.getElementById('p_disc').value = formatNumNoRs((m.disc!=null?m.disc:(m.discount||0))); document.getElementById('p_qty').value=1; });

  // SKU behavior
  const skuInput=document.getElementById('sku_in');
  const pName=document.getElementById('p_name'); const pPrice=document.getElementById('p_price'); const pQty=document.getElementById('p_qty'); const pMrp=document.getElementById('p_mrp'); const pDisc=document.getElementById('p_disc');
// --- SAFE PATCH: Auto-calc Unit Price = MRP - Discount when edited manually
['input','change','blur'].forEach(function(evt){
  try{
    const pMrp=document.getElementById('p_mrp');
    const pDisc=document.getElementById('p_disc');
    const pPrice=document.getElementById('p_price');
    if(pMrp && pDisc && pPrice){
      const recalc=function(){
        const mrp=parseMoney(pMrp.value||0);
        const disc=parseMoney(pDisc.value||0);
        const newPrice=Math.max(0, mrp - disc);
        pPrice.value = formatNumNoRs(newPrice);
      };
      pMrp.addEventListener(evt, recalc);
      pDisc.addEventListener(evt, recalc);
    }
  }catch(e){ /* no-op */ }
});
// --- END PATCH

  skuInput.addEventListener('input', ()=>{
    const valIn=skuInput.value.trim().toLowerCase();
    const item=db.inv.find(x=>(x.sku && x.sku.toLowerCase()===valIn) || (x.name && x.name.toLowerCase().startsWith(valIn)));
    if(item){
      pName.value=item.name||'';
      const mrp = Number(item.mrp ?? item.price ?? 0);
      const disc = Number(item.discount ?? 0);
      pMrp.value = formatNumNoRs(mrp);
      pDisc.value = formatNumNoRs(disc);
      pPrice.value = formatNumNoRs(Math.max(0, mrp - disc));
      pQty.value=1;
    } else {
      pName.value=''; pMrp.value='0.00'; pDisc.value='0.00'; pPrice.value='0.00';
    }
  });
  pName.addEventListener('input', ()=>{
    const valIn=pName.value.trim().toLowerCase();
    const item=db.inv.find(x=>(x.name && x.name.toLowerCase().startsWith(valIn)) || (x.sku && x.sku.toLowerCase()===valIn));
    if(item){
      skuInput.value=item.sku||'';
      const mrp = Number(item.mrp ?? item.price ?? 0);
      const disc = Number(item.discount ?? 0);
      pMrp.value = formatNumNoRs(mrp);
      pDisc.value = formatNumNoRs(disc);
      pPrice.value = formatNumNoRs(Math.max(0, mrp - disc));
      pQty.value=1;
    } else {
      skuInput.value=''; pMrp.value='0.00'; pDisc.value='0.00'; pPrice.value='0.00';
    }
  });

  document.getElementById('add_line').addEventListener('click', ()=>{
    const sku=skuInput.value.trim(); const item=db.inv.find(x=>x.sku && x.sku.toLowerCase()===sku.toLowerCase());
    if(!item) return alert('SKU not found'); const qty=Number(pQty.value||1); if(qty<=0) return alert('Qty must be >=1'); if(item.qty < qty) return alert('Not enough stock'); const price=parseMoney(pPrice.value||item.price), disc=parseMoney(document.getElementById('p_disc').value||0);
    _cart.push({pid:item.id, sku:item.sku, name:item.name, qty, mrp: parseMoney(document.getElementById('p_mrp').value||0), price, disc, cost:item.cost});
    drawCart();
    skuInput.value=''; pName.value=''; pPrice.value='0.00'; pQty.value=0; document.getElementById('p_disc').value='0.00'; skuInput.focus();

function setupAutocomplete(inputElem, type){
  inputElem.addEventListener('input', ()=>{
    const val = inputElem.value.trim().toLowerCase();
    const matches = db.inv.filter(it => 
      (it.sku && it.sku.toLowerCase().includes(val)) || 
      (it.name && it.name.toLowerCase().includes(val))
    );
    let list = document.getElementById(inputElem.id+'_list');
    if(!list){ 
      list = document.createElement('div'); 
      list.id = inputElem.id+'_list'; 
      list.style.position='absolute'; 
      list.style.background='#fff'; 
      list.style.zIndex=1000; 
      list.style.color='#000'; 
      list.style.width=inputElem.offsetWidth+'px'; 
      document.body.appendChild(list); 
    }
    list.innerHTML = '';
    const rect = inputElem.getBoundingClientRect();
    list.style.left = rect.left+'px'; 
    list.style.top = rect.bottom+'px';
    matches.slice(0,5).forEach(m=>{
      const item = document.createElement('div');
      item.style.padding='4px 8px'; 
      item.style.cursor='pointer';
      item.textContent = m.sku+' - '+m.name;
      item.onclick = ()=>{
        document.getElementById('sku_in').value = m.sku;
        document.getElementById('p_name').value = m.name;
        document.getElementById('p_price').value = formatNumNoRs((m.price!=null?m.price:((m.mrp||0)-(m.discount||0))));
        document.getElementById('p_qty').value = 0;
        list.innerHTML = '';
      };
      list.appendChild(item);
    });
  });
}
setupAutocomplete(document.getElementById('sku_in'),'sku');
setupAutocomplete(document.getElementById('p_name'),'name');


// --- Auto-calc Unit Price = MRP - Discount (invoice discount overrides inventory) ---
function updateUnitPrice() {
  let mrp = parseFloat(document.getElementById('mrp').value) || 0;
  let disc = document.getElementById('disc').value;
  let discVal = disc === "" ? 0 : parseFloat(disc);
  if (isNaN(discVal)) discVal = 0;
  document.getElementById('u_price').value = (mrp - discVal).toFixed(2);
}
// Trigger update when MRP or Discount changes
document.getElementById('mrp').addEventListener('input', updateUnitPrice);
document.getElementById('disc').addEventListener('input', updateUnitPrice);

document.getElementById('disc').addEventListener('input', updateUnitPrice);


  // Live recalc when Discount changes
  pDisc.addEventListener('input', ()=>{
    const mrp = parseMoney(pMrp.value||0);
    const disc = parseMoney(pDisc.value||0);
    pPrice.value = formatNumNoRs(Math.max(0, mrp - disc));
  });

  });

  function drawCart(){ if(!_cart.length){ document.getElementById('cart_area').innerHTML='<p>No lines yet.</p>'; return; } const rows=_cart.map((l,i)=>{ const lineTotal = (l.mrp - l.disc) * l.qty; return `<tr><td>${l.sku||''}</td><td>${l.name}</td><td>${l.qty}</td><td>${fmtMoney(l.mrp)}</td><td>${fmtMoney(l.mrp - l.disc)}</td><td style="width:120px">${fmtMoney(l.disc)}</td><td>${fmtMoney(lineTotal)}</td><td><button class="btn ghost" style="height:40px;display:flex;align-items:center;justify-content:center" onclick="editLine(${i})">Edit</button> <button class="btn danger" onclick="delLine(${i})">Delete</button></td></tr>`; }).join(''); const totals=_cart.reduce((acc,l)=>{acc.sub+=l.qty*l.mrp; acc.disc+=l.qty*l.disc; acc.cost+=l.qty*l.cost; return acc;},{sub:0,disc:0,cost:0}); const grand=totals.sub - totals.disc; document.getElementById('cart_area').innerHTML=`<table class="table"><thead><tr><th>SKU</th><th>Product Name</th><th>Qty</th><th>MRP</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4"></td><td>Total Discount</td><td>${fmtMoney(totals.disc)}</td><td></td></tr><tr><td colspan="4"></td><td>Total Amount</td><td>${fmtMoney(grand)}</td><td></td></tr></tfoot></table>`; const cash=Number(document.getElementById('cash_given').value||0); document.getElementById('change_due').value = (Number(Math.max(0, cash - grand||0)).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2})); }

  window.editLine=function(i){ const l=_cart[i]; if(!l) return; const qty=Number(prompt('Qty',l.qty)); if(Number.isNaN(qty)||qty<=0) return; const price=Number(prompt('Unit Price',l.price)); if(Number.isNaN(price)||price<0) return; const disc=Number(prompt('Discount',l.disc)); if(Number.isNaN(disc)||disc<0) return; _cart[i]={...l,qty,price,disc}; drawCart(); };
  window.delLine=function(i){ if(currentUser?.role!=='admin'){ const pin=prompt('Admin password required to delete line:'); const admin=db.users.find(u=>u.role==='admin' && u.password===pin); if(!admin) return alert('Invalid admin password'); } _cart.splice(i,1); drawCart(); };

  document.getElementById('cash_given').addEventListener('input', ()=>{ const cash=Number(document.getElementById('cash_given').value||0); const totals=_cart.reduce((acc,l)=>{acc.sub+=l.qty*l.mrp;acc.disc+=l.qty*l.disc;return acc;},{sub:0,disc:0}); const grand=totals.sub - totals.disc; document.getElementById('change_due').value = (Number(Math.max(0,cash-grand||0)).toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2})); });

  document.getElementById('save_inv').addEventListener('click', ()=>{
    if(!_cart.length) return alert('No lines to save');
    let custId=document.getElementById('c_sel').value, custName='';
    if(custId==='new'){ custName=document.getElementById('c_name').value.trim()||'Customer'; const phone=document.getElementById('c_phone').value.trim(); const c={id:uid(), name:custName, phone, email:''}; const list=db.cust; list.unshift(c); db.cust=list; custId=c.id; } else { const c=db.cust.find(x=>x.id===custId); custName=c?c.name:'Customer'; }
    const totals=_cart.reduce((acc,l)=>{acc.sub+=l.qty*l.mrp;acc.disc+=l.qty*l.disc;acc.cost+=l.qty*l.cost;return acc;},{sub:0,disc:0,cost:0});
    const grand=totals.sub - totals.disc;
    // reduce inventory
    const invList=db.inv; _cart.forEach(l=>{ const it=invList.find(x=>x.id===l.pid); if(it) it.qty=Math.max(0,it.qty-l.qty); }); db.inv=invList;
    // consume invoice number now
    const invNo = nextInvoiceNo();
    const sale = { id:uid(), invNo, date:new Date().toISOString(), customerId:custId, customerName:custName, items:_cart.map(l=>({id:l.pid,name:l.name,qty:l.qty,price:l.price,disc:l.disc,cost:l.cost,sku:l.sku})), total:grand, discount:totals.disc, costTotal:totals.cost, notes:document.getElementById('notes').value.trim() };
    const sales=db.sales; sales.unshift(sale); db.sales=sales;
    const cash=Number(document.getElementById('cash_given').value||0); const change=Math.max(0,cash-grand);
    alert(`Saved. Change due: ${fmtMoney(change)}. Invoice # ${invNo}`);
    showInvoiceView(sale);
  });

  document.getElementById('print_inv').addEventListener('click', ()=> alert('Please save first, then print from the saved invoice view.'));
  document.getElementById('close_inv').addEventListener('click', ()=> show('dashboard'));

  // calculator modal behavior
  const calcModal=document.getElementById('calc_modal'); const calcDisplay=document.getElementById('calc_display');
  let calcExpr='';
  document.getElementById('open_calc').addEventListener('click', ()=>{ calcModal.style.display='block'; calcExpr=''; calcDisplay.textContent='0'; });
  calcModal.querySelectorAll('button[data-val]').forEach(b=> b.addEventListener('click', ()=>{ calcExpr += b.getAttribute('data-val'); calcDisplay.textContent = calcExpr; }));
  calcModal.querySelectorAll('button[data-op]').forEach(b=> b.addEventListener('click', ()=>{ calcExpr += b.getAttribute('data-op'); calcDisplay.textContent = calcExpr; }));
  document.getElementById('calc_eq').addEventListener('click', ()=>{ try{ const r=eval(calcExpr||'0'); calcDisplay.textContent = String(r); }catch(e){ calcDisplay.textContent='ERR'; } });
  document.getElementById('calc_copy').addEventListener('click', ()=>{ const v=calcDisplay.textContent.replace(/[^0-9.\-]/g,''); document.getElementById('cash_given').value = v; document.getElementById('cash_given').dispatchEvent(new Event('input')); });
  document.getElementById('calc_close').addEventListener('click', ()=>{ calcModal.style.display='none'; });
}

// view saved invoice
function showInvoiceView(s){
  const rows = s.items.map(l=>`<tr><td>${l.sku||''}</td><td>${l.name||l.product||''}</td><td>${l.qty||0}</td><td>${fmtMoney((l.mrp!=null?l.mrp:(l.price||0)+(l.disc||0)))}</td><td>${fmtMoney(l.price!=null?l.price:((l.mrp||0)-(l.disc||0)))}</td><td>${fmtMoney(l.disc||0)}</td><td>${fmtMoney((l.total!=null?l.total:((l.price!=null?l.price:((l.mrp||0)-(l.disc||0))) * (l.qty||0))))}</td></tr>`).join('');
  document.getElementById('content').innerHTML = `<div class="card"><h3>Invoice #${s.invNo}</h3><p>Date: ${new Date(s.date).toLocaleString()}</p><p>Customer: ${s.customerName}</p><table class="table"><thead><tr><th>SKU</th><th>Product Name</th><th>Qty</th><th>MRP</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p style="font-weight:800">Total Discount: ${fmtMoney(s.discount)} &nbsp;&nbsp; Total: ${fmtMoney(s.total)}</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" style="height:40px;display:flex;align-items:center;justify-content:center" onclick="printInvoice('${s.id}')">Print</button> ${ currentUser?.role==='admin' ? `<button class="btn danger" onclick="deleteInvoice('${s.id}')">Delete</button>` : '' } <button class="btn ghost" style="height:40px;display:flex;align-items:center;justify-content:center" onclick="show('dashboard')">Close</button></div></div>`;
}

window.printInvoice=function(id){ const s=db.sales.find(x=>x.id===id); if(!s) return; const settings=getSettings(); const rows=s.items.map(l=>`<tr><td>${l.sku||''}</td><td>${l.name||l.product||''}</td><td>${l.qty||0}</td><td>${fmtMoney((l.mrp!=null?l.mrp:(l.price||0)+(l.disc||0)))}</td><td>${fmtMoney(l.price!=null?l.price:((l.mrp||0)-(l.disc||0)))}</td><td>${fmtMoney(l.disc||0)}</td><td>${fmtMoney((l.total!=null?l.total:((l.price!=null?l.price:((l.mrp||0)-(l.disc||0))) * (l.qty||0))))}</td></tr>`).join(''); const win=window.open('','_blank'); win.document.write(`<html><head><title>Invoice #${s.invNo}</title><style>body{font-family:Arial;padding:20px;color:#000;background:#fff}h2{margin:0 0 4px 0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #000;padding:6px;text-align:left}.top{display:flex;gap:10px;align-items:center}.top img{max-width:200px;height:auto}</style></head><body><div class="top">${settings.logoDataUrl?`<img src="${settings.logoDataUrl}"/>`:''}<div><h2>${settings.companyName}</h2><div>${settings.address}</div><div>${settings.phone} • ${settings.email}</div></div></div><p>Invoice #: ${s.invNo} • Date: ${new Date(s.date).toLocaleString()}</p><p>Customer: ${s.customerName}</p><table><thead><tr><th>SKU</th><th>Product Name</th><th>Qty</th><th>MRP</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><h3>Total Discount: ${fmtMoney(s.discount)} &nbsp;&nbsp; Total: ${fmtMoney(s.total)}</h3></body></html>`); win.document.close(); win.print(); }

window.deleteInvoice=function(id){ if(currentUser?.role!=='admin') return alert('Admin only'); if(!confirm('Delete this invoice?')) return; db.sales = db.sales.filter(x=>x.id!==id); alert('Deleted'); renderSales(); }

// Settings - admin only can edit company info, logo, reset user password locally
function renderSettings(){
  if(currentUser?.role!=='admin'){ document.getElementById('content').innerHTML = `<div class="card"><h3>Settings</h3><div class="badge">Admin only</div></div>`; return; }
  const s=getSettings();
  document.getElementById('content').innerHTML = `
    <div class="card">
      <h3>Settings</h3>
      <div class="form-row">
        <div class="field"><label>Company Name<input id="st_name" class="input" value="${s.companyName}"/></label></div>
        <div class="field"><label>Address<input id="st_addr" class="input" value="${s.address}"/></label></div>
        <div class="field"><label>Phone<input id="st_phone" class="input" value="${s.phone}"/></label></div>
        <div class="field"><label>Email<input id="st_email" class="input" value="${s.email}"/></label></div>
      </div>
      <div class="form-row" style="margin-top:8px">
        <div class="field"><label>Currency Code<input id="st_cc" class="input" value="${s.currencyCode}"/></label></div>
        <div class="field"><label>Currency Prefix<input id="st_cp" class="input" value="${s.currencyPrefix}"/></label></div>
        <div class="field"><label>Logo (max width 200px)<input id="st_logo" type="file" class="input" accept="image/*"/></label></div>
        <div><img id="st_logo_prev" src="${s.logoDataUrl}" style="max-width:200px;height:auto;border-radius:8px"/></div>
      </div>
      <div style="margin-top:10px"><button class="btn primary" style="height:40px;display:flex;align-items:center;justify-content:center" id="st_save">Save Settings</button></div>

      <hr style="margin-top:14px;opacity:.06"/>

      <h4>Manage Users</h4>
      <div id="user_list" style="margin-top:8px"></div>
      <div style="margin-top:8px"><button class="btn danger" id="reset_user_pw">Reset selected user's password</button></div>
    </div>
  `;
  document.getElementById('st_logo').addEventListener('change', (e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ document.getElementById('st_logo_prev').src=r.result; const s=getSettings(); s.logoDataUrl=r.result; setSettings(s); layout(); show('settings'); }; r.readAsDataURL(f); });
  document.getElementById('st_save').addEventListener('click', ()=>{ const s=getSettings(); s.companyName=val('st_name'); s.address=val('st_addr'); s.phone=val('st_phone'); s.email=val('st_email'); s.currencyCode=val('st_cc'); s.currencyPrefix=val('st_cp'); setSettings(s); alert('Saved'); layout(); show('settings'); });

  // user list
  const users=db.users; document.getElementById('user_list').innerHTML = `<table class="table"><thead><tr><th>Username</th><th>Role</th><th>Email</th><th></th></tr></thead><tbody>${users.map(u=>`<tr data-usr="${u.username}"><td>${u.username}</td><td>${u.role}</td><td>${u.email||''}</td><td><button class="btn" style="height:40px;display:flex;align-items:center;justify-content:center" onclick="selectUser('${u.username}')">Select</button></td></tr>`).join('')}</tbody></table><div style="margin-top:8px"><input id="sel_user" class="input" placeholder="Selected username" readonly/></div>`;

  document.getElementById('reset_user_pw').addEventListener('click', ()=>{
    const sel=document.getElementById('sel_user').value.trim(); if(!sel) return alert('Select a user from the table first');
    const newpw = prompt('Enter new password for '+sel); if(!newpw) return;
    const users=db.users; const u=users.find(x=>x.username===sel); if(!u) return alert('User not found'); u.password=newpw; db.users=users; alert('Password updated for '+sel);
  });
}

// helper to set selected user in settings
window.selectUser = function(username){ document.getElementById('sel_user').value = username; }

// export/import
function exportJSON(){ const payload={inventory:db.inv,sales:db.sales,customers:db.cust,purchases:db.pur,settings:getSettings(),seq:db.seq,users:db.users}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`artgraphx-pos-v3-offline-backup-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url); }
function handleImport(ev){ const f=ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=()=>{ try{ const j=JSON.parse(reader.result); if(!confirm('Import will overwrite current data. Continue?')) return; if(j.inventory) db.inv=j.inventory; if(j.sales) db.sales=j.sales; if(j.customers) db.cust=j.customers; if(j.purchases) db.pur=j.purchases; if(j.settings) setSettings(j.settings); if(j.seq) db.seq=j.seq; if(j.users) db.users=j.users; alert('Import complete'); layout(); show('dashboard'); document.querySelectorAll('.nav-btn').forEach(btn=>{btn.classList.toggle('active', btn.dataset.section==='dashboard');}); }catch(e){ alert('Invalid JSON'); } }; reader.readAsText(f); }

function val(id){ return document.getElementById(id).value.trim(); }
function num(id){ return Number(document.getElementById(id).value||0); }

// initial boot
renderLogin();


var style = document.createElement('style');
style.innerHTML = `.btn:hover { transform: scale(1.05); transition: transform 0.2s ease-in-out; }`;
document.head.appendChild(style);


document.addEventListener('DOMContentLoaded', ()=>{
  const origRenderLogin = window.renderLogin;
  if (typeof origRenderLogin === 'function') {
    window.renderLogin = function(){
      origRenderLogin();
      const appEl = document.getElementById('app');
      if (appEl && !appEl.querySelector('.footer-bar')) {
        const s = typeof getSettings==='function' ? getSettings() : {};
        const logoUrl = (s && s.logoDataUrl) ? s.logoDataUrl : (document.getElementById('footerLogo')?.src || 'logo-light-transparent-2.png');
        appEl.innerHTML += `<div class="footer-bar">
          <div class="left">Copyright © 2025 ArtGraphX. All rights reserved.</div>
          <div class="center">POS System Powered by <img src="${logoUrl}" alt="logo"/></div>
          <div class="right">Version 1.0</div>
        </div>`;
      }
    };
  }
});


// Hide product dropdown on outside click
document.addEventListener('click', function(e) {
    const list = document.getElementById('productDropdown');
    if (list && !list.contains(e.target) && e.target.id !== 'productName') {
        list.style.display = 'none';
    }
});

;[ 'p_price','p_disc','cash_given' ].forEach(id=>{
  const el=document.getElementById(id); if(!el) return;
  el.addEventListener('input', ()=>{ el.value = String(el.value).replace(/[^0-9.\-]/g,''); });
});


function formatNumberWithCommas(x){
    var parts = parseFloat(x||0).toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}
['p_price','p_disc','cash_given','change_due'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.addEventListener('blur', ()=>{
        let num = parseFloat(String(el.value).replace(/[^0-9.\-]/g,''));
        if(isNaN(num)) num = 0;
        el.value = formatNumberWithCommas(num);
    });
    el.addEventListener('input', ()=>{
        el.value = String(el.value).replace(/[^0-9.\-]/g,'');
    });
});



(function(){
  function formatNum(x){ 
    const n = Number(String(x||'').replace(/[^0-9.\-]/g,''))||0; 
    return n.toLocaleString('en-LK',{minimumFractionDigits:2,maximumFractionDigits:2}); 
  }
  ['p_price','p_disc','cash_given','change_due'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el) return;
    el.addEventListener('input',()=>{
      el.value = String(el.value).replace(/[^0-9.\-]/g,'');
    });
    el.addEventListener('blur',()=>{
      el.value = formatNum(el.value);
    });
  });
})();


/*__NUM_INPUT_LISTENERS__*/
['p_price','p_disc','cash_given','change_due'].forEach(id=>{
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('input',()=>{
    el.value = String(el.value).replace(/[^0-9.\-]/g,'');
  });
  el.addEventListener('blur',()=>{
    el.value = formatNumNoRs(el.value);
  });
});


// Enter key triggers Add
document.addEventListener('keydown', function(e){
  if(e.key==='Enter'){
    const addBtn=document.getElementById('add_line');
    if(addBtn) addBtn.click();
  }
});


// === Inventory Management ===
function getInventory() {
    return JSON.parse(localStorage.getItem("inventory")) || [];
}

function saveInventory(inventory) {
    localStorage.setItem("inventory", JSON.stringify(inventory));
}

// Add Item button click
// Export JSON button click



// === Product Name Autocomplete for Customer Invoice (Final Force-Split) ===
(function(){
  let attached = false;
  const timer = setInterval(() => {
    const inputProductName = document.getElementById('invoice_product');
    if(inputProductName && !attached){
      attached = true;
      clearInterval(timer);

      const inputSKU = document.getElementById('invoice_sku');
      const inputPrice = document.getElementById('invoice_price');
      const inputMRP = document.getElementById('invoice_mrp');
      const inputQty = document.getElementById('invoice_qty');

      inputProductName.setAttribute('autocomplete','off');

      const suggestionsBox = document.createElement('div');
      suggestionsBox.id = 'product_suggestions';
      suggestionsBox.className = 'suggestions';
      suggestionsBox.style.display = 'none';
      (inputProductName.closest('.field') || inputProductName.parentElement || document.body).appendChild(suggestionsBox);

      let matches = [];
      let currentIndex = -1;

      function extractNameOnly(item){
        let raw = (item && item.name ? String(item.name) : '').trim();
        if(!raw) return '';
        const m = raw.match(/[-–—]/);
        if(m){
          const idx = raw.indexOf(m[0]);
          const after = raw.slice(idx+1).trim();
          if(after.length) return after;
        }
        return raw;
      }

      function renderSuggestions(){
        suggestionsBox.innerHTML = '';
        matches.forEach((item, idx) => {
          const el = document.createElement('div');
          el.className = 'suggestion-item';
          if(idx === currentIndex) el.classList.add('active');
          el.textContent = extractNameOnly(item);
          el.addEventListener('mousedown', e => { e.preventDefault(); applySelection(item); });
          suggestionsBox.appendChild(el);
        });
        suggestionsBox.style.display = matches.length ? 'block' : 'none';
      }

      function applySelection(item){
        inputProductName.value = extractNameOnly(item);
        if(inputSKU) inputSKU.value = item.sku || '';
        if(inputMRP) inputMRP.value = (typeof fmtMoney === 'function') ? fmtMoney(item.mrp || 0) : (item.mrp || 0);
        if(inputPrice) inputPrice.value = (typeof fmtMoney === 'function') ? fmtMoney(item.price || 0) : (item.price || 0);
        if(inputQty) inputQty.value = 1;
        suggestionsBox.style.display = 'none';
      }

      inputProductName.addEventListener('input', () => {
        const query = inputProductName.value.trim().toLowerCase();
        if(!query){ suggestionsBox.style.display = 'none'; return; }
        const inv = (window.db && Array.isArray(window.db.inv)) ? window.db.inv : (window.db && window.db.inv) || [];
        matches = inv.filter(item => {
          const name = (item.name || '').toLowerCase();
          const sku = (item.sku || '').toLowerCase();
          const cat = (item.category || '').toLowerCase();
          return name.includes(query) || sku.includes(query) || cat.includes(query);
        }).slice(0, 10);
        currentIndex = -1;
        renderSuggestions();
      });

      inputProductName.addEventListener('keydown', e => {
        if(!matches.length) return;
        if(e.key === 'ArrowDown'){ e.preventDefault(); currentIndex = (currentIndex+1) % matches.length; renderSuggestions(); }
        else if(e.key === 'ArrowUp'){ e.preventDefault(); currentIndex = (currentIndex-1+matches.length) % matches.length; renderSuggestions(); }
        else if(e.key === 'Enter'){ e.preventDefault(); if(currentIndex >= 0) applySelection(matches[currentIndex]); }
        else if(e.key === 'Escape'){ suggestionsBox.style.display = 'none'; }
      });

      document.addEventListener('click', e => {
        if(suggestionsBox.style.display === 'block' && !suggestionsBox.contains(e.target) && e.target !== inputProductName){
          suggestionsBox.style.display = 'none';
        }
      });
    }
  }, 400);
})();
