process.on('unhandledRejection', (e) => { console.log('UNHANDLED:', e && e.message); });
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4000';
const ROOT = path.join(__dirname, '..', 'home/user/ScottsTechX/school-communication-platform');
const ROOT2 = '/home/user/ScottsTechX/school-communication-platform';
async function main(){
  const r = await fetch(BASE+'/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'superadmin',password:'SuperAdmin@123'})});
  const data = await r.json();
  const cookies = r.headers.getSetCookie().map(c=>c.split(';')[0]);
  const dom = new JSDOM(fs.readFileSync(ROOT2+'/frontend/platform/super-admin/index.html','utf8'), {url: BASE+'/platform/super-admin/', runScripts:'outside-only', pretendToBeVisual:true});
  const {window} = dom;
  window.fetch = (i,init={}) => { const h=new Headers(init.headers||{}); h.set('cookie', cookies.join('; ')); return globalThis.fetch(i,{...init,headers:h}); };
  window.FormData=globalThis.FormData; window.Blob=globalThis.Blob; window.Headers=globalThis.Headers; window.URL=globalThis.URL;
  window.scrollTo=()=>{}; window.HTMLElement.prototype.scrollIntoView=()=>{};
  Object.defineProperty(window,'innerWidth',{value:1280,configurable:true});
  window.addEventListener('error', e=>console.log('WINDOW ERR', e.message));
  const errs=[]; const oe=console.error; console.error=(...a)=>{errs.push(a.map(String).join(' '));};
  const scripts=['js/config.js','js/icons.js','js/api.js','js/theme.js','js/ui.js','js/socket-client.js','js/components/messaging.js','js/components/documents.js','js/components/announcements.js','js/components/academics.js','js/components/users.js','js/components/website.js','platform/super-admin/app.js'];
  for (const s of scripts) { try { window.eval(fs.readFileSync(ROOT2+'/frontend/'+s,'utf8')); } catch(e){ console.log('eval fail',s,e.message);} }
  await new Promise(r=>setTimeout(r,2500));
  await window.__navHandler('announcements');
  await new Promise(r=>setTimeout(r,1500));
  const content = window.document.getElementById('content');
  console.log('buttons:', [...content.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(0,20));
  // find edit buttons
  const editBtns = [...content.querySelectorAll('button')].filter(b=>/edit/i.test(b.textContent));
  console.log('edit buttons', editBtns.length);
  if (editBtns.length) {
    try { editBtns[0].click(); } catch(e){ console.log('CLICK THREW', e.message); }
    await new Promise(r=>setTimeout(r,400));
    const m = window.document.querySelector('.modal-backdrop');
    console.log('modal opened?', !!m, m && m.querySelector('#ann-target') ? 'has target' : 'NO TARGET SELECT');
    if (m) console.log('modal body html:', m.querySelector('.modal-body').innerHTML.slice(0,400));
  }
  console.error=oe;
  window.close();
}
main().catch(e=>{console.log('FATAL', e); process.exit(1);});
