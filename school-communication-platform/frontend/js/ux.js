(function(){
  'use strict';
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function enhance(){
    if(reduce)return;
    const els=document.querySelectorAll('.card,.stat-card,.doc-item,.ann-item');
    els.forEach((el,i)=>{if(!el.hasAttribute('data-reveal')){el.setAttribute('data-reveal','');el.style.transitionDelay=Math.min(i*20,160)+'ms';}});
    const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');io.unobserve(e.target)}}),{threshold:.06});
    document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));
  }
  function mobile(){
    const sidebar=document.querySelector('.sidebar'); if(!sidebar)return;
    let overlay=document.querySelector('.mobile-overlay');
    if(!overlay){overlay=document.createElement('div');overlay.className='mobile-overlay';document.body.appendChild(overlay);}
    const open=()=>{sidebar.classList.add('open');overlay.classList.add('open');document.body.style.overflow='hidden'};
    const close=()=>{sidebar.classList.remove('open');overlay.classList.remove('open');document.body.style.overflow=''};
    const btn=document.querySelector('.topbar .hamburger');
    if(btn&&!btn.dataset.uxBound){btn.dataset.uxBound='1';btn.addEventListener('click',()=>sidebar.classList.contains('open')?close():open());}
    overlay.addEventListener('click',close);
    sidebar.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',close));
  }
  document.addEventListener('DOMContentLoaded',()=>{enhance();mobile();});
  window.PlatformUX={enhance,mobile};
})();
