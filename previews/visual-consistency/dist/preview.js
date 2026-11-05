const assets=JSON.parse(document.querySelector('#preview-assets').textContent);for(const image of document.querySelectorAll('img[data-asset]'))image.src=assets[image.dataset.asset];
const saved=()=>{try{return localStorage.getItem('glohaus-design-review-theme')}catch{return null}};
const media=matchMedia('(prefers-color-scheme:dark)');
const setTheme=(value,persist=true)=>{const theme=value==='system'?(media.matches?'night':'light'):value;document.documentElement.dataset.theme=theme;for(const control of document.querySelectorAll('#theme,#menu-theme'))control.value=value;if(persist)try{localStorage.setItem('glohaus-design-review-theme',value)}catch{}};
setTheme(saved()||'system',false);
for(const control of document.querySelectorAll('#theme,#menu-theme'))control.onchange=e=>setTheme(e.target.value);
media.addEventListener('change',()=>{if(!saved()||saved()==='system')setTheme('system',false)});
document.querySelector('#viewport').onchange=e=>{document.querySelector('.stage').style.maxWidth=e.target.value;document.querySelector('.stage').dataset.width=e.target.value;};
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>{for(const item of document.querySelectorAll('[data-view]')){item.setAttribute('aria-pressed',String(item===button))}for(const section of document.querySelectorAll('.view'))section.hidden=section.id!==button.dataset.view;};
document.querySelector('#show-loading').onclick=()=>{document.querySelector('#splash').hidden=false;document.querySelector('#preview').scrollIntoView({block:'start'});};
document.querySelector('#close-loading').onclick=()=>document.querySelector('#splash').hidden=true;
document.querySelector('#search-form').onsubmit=e=>{e.preventDefault();document.querySelector('#search-status').textContent='Preview only. The existing /explore search route and data will be preserved.';};
for(const item of document.querySelectorAll('[data-close-menu]'))item.onclick=()=>document.querySelector('#menu').open=false;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelector('#menu').open=false;document.querySelector('#splash').hidden=true;}});
document.querySelector('#dismiss-install').onclick=()=>{document.querySelector('#install-card').hidden=true;document.querySelector('#install-status').textContent='Dismissed in this preview. Proposed production behaviour retains the existing 90-day dismissal.';};

for(const button of document.querySelectorAll('[data-booking]'))button.onclick=()=>{for(const item of document.querySelectorAll('[data-booking]'))item.setAttribute('aria-pressed',String(item===button));document.querySelector('#booking-example').textContent=({upcoming:'Upcoming appointments remain here.',history:'History keeps previous visits, reviews and rebooking together.',all:'All appointments stays available without an extra page.'})[button.dataset.booking]+' No real booking data is loaded in this preview.';};
