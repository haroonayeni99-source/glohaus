import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BookingPicker} from '@/components/booking-picker';
const palette=readFileSync('src/app/visual-refinement.css','utf8').split('.mobile-home-brand')[0];
const blocks=[...palette.matchAll(/:root(?:\[data-theme="night"\])?\s*\{([^}]+)\}/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(--gh-[\w-]+):\s*(#[0-9a-f]+)/gi)].map(v=>[v[1],v[2]])));
function luminance(hex:string){const h=hex.slice(1);const full=h.length===3?[...h].map(c=>c+c).join(''):h;const rgb=[0,2,4].map(i=>parseInt(full.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
it.each([0,1])('keeps text/action and meaningful control edges above AA targets in palette %i',i=>{const p=blocks[i];for(const [fg,bg] of [['--gh-text','--gh-surface'],['--gh-muted','--gh-surface'],['--gh-on-action','--gh-action']])expect(contrast(p[fg],p[bg])).toBeGreaterThanOrEqual(4.5);for(const [fg,bg]of[['--gh-control-border','--gh-surface'],['--gh-focus','--gh-surface']])expect(contrast(p[fg],p[bg])).toBeGreaterThanOrEqual(3);});
it('identifies today without changing date or slot selection behaviour',()=>{const html=renderToStaticMarkup(React.createElement(BookingPicker,{services:[{id:'fixture',professional_id:'pro',name:'Service',description:'',price_pence:5000,deposit_pence:1500,duration_minutes:60}],ready:true,returnPath:'/p/test',professionalName:'Test',bookingFeePence:100,verificationStatus:'verified'}));expect(html).toContain('aria-current="date"');expect(html).toContain(', today');expect(html).toContain('type="date"');});
