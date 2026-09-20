(function(){
  'use strict';
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Scroll lock shared with UI.js when it is present, so a modal and the
     phone drawer never fight over body overflow. */
  function lock(){
    if(window.UI&&UI.lockScroll)return UI.lockScroll();
    if(document.body.dataset.uxLocked)return;
    document.body.dataset.uxLocked=document.body.style.overflow||' ';
    document.body.style.overflow='hidden';
  }
  function unlock(){
    if(window.UI&&UI.unlockScroll)return UI.unlockScroll();
    if(!document.body.dataset.uxLocked)return;
    document.body.style.overflow=document.body.dataset.uxLocked.trim();
    delete document.body.dataset.uxLocked;
  }

  function enhance(){
    if(reduce)return;
    // No IntersectionObserver (very old browsers / test shims): leave the page
    // alone rather than hiding cards that nothing would ever reveal.
    if(!('IntersectionObserver' in window))return;
    const els=document.querySelectorAll('.card,.stat-card,.doc-item,.ann-item');
    els.forEach((el,i)=>{if(!el.hasAttribute('data-reveal')){el.setAttribute('data-reveal','');el.style.transitionDelay=Math.min(i*20,160)+'ms';}});
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}}),{threshold:.06});
    document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));
  }

  function mobile(){
    const sidebar=document.querySelector('.sidebar'); if(!sidebar)return;
    let overlay=document.querySelector('.mobile-overlay');
    if(!overlay){overlay=document.createElement('div');overlay.className='mobile-overlay';document.body.appendChild(overlay);}
    let locked=false;
    const open=()=>{sidebar.classList.add('open');overlay.classList.add('open');if(!locked){locked=true;lock();}};
    const close=()=>{sidebar.classList.remove('open');overlay.classList.remove('open');if(locked){locked=false;unlock();}};
    const btn=document.querySelector('.topbar .hamburger');
    // UI.initLayout binds this button on the real dashboards (dataset.uxBound);
    // this is only the fallback for a page that does not load UI.js.
    if(btn&&!btn.dataset.uxBound){btn.dataset.uxBound='1';btn.addEventListener('click',()=>sidebar.classList.contains('open')?close():open());}
    overlay.addEventListener('click',close);
    sidebar.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',close));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    try{enhance();}catch(e){}
    try{mobile();}catch(e){}
  });
  window.PlatformUX={enhance,mobile};
})();
