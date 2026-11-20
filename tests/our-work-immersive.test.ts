// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {OurWork} from '@/components/our-work';
import type{PublicSocialPost}from '@/modules/business-tools/domain';
vi.mock('next/link',()=>({default:(props:object)=>React.createElement('a',props)}));
vi.mock('next/image',()=>({default:({unoptimized,...props}:React.ImgHTMLAttributes<HTMLImageElement>&{unoptimized?:boolean})=>{void unoptimized;return React.createElement('img',props);}}));
let host:HTMLDivElement,root:Root;let stopped:WeakMap<HTMLMediaElement,boolean>;
const post:PublicSocialPost={id:'instagram',platform:'instagram',original_url:'https://www.instagram.com/reel/EXAMPLE/',caption:'Instagram work',publication_status:'published',source_created_at:null,service_id:null,sort_order:0,media_type:'video',has_thumbnail:true,professional_id:'fixture',slug:'fixture',business_name:'Fixture',service_name:null,price_pence:null};
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false}));vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});vi.stubGlobal('scrollTo',vi.fn());
 stopped=new WeakMap();vi.spyOn(HTMLMediaElement.prototype,'paused','get').mockImplementation(function(this:HTMLMediaElement){return stopped.get(this)??true;});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockImplementation(function(this:HTMLMediaElement){stopped.set(this,false);this.dispatchEvent(new Event('play'));return Promise.resolve();});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){stopped.set(this,true);this.dispatchEvent(new Event('pause'));});vi.spyOn(HTMLMediaElement.prototype,'load').mockImplementation(()=>{});
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function render(){await act(async()=>root.render(React.createElement(OurWork,{immersive:true,businessName:'Fixture',assets:[{id:'photo',alt_text:'Photo',media_type:'image'},{id:'video',alt_text:'Video',media_type:'video'}],posts:[post,{...post,id:'tiktok',platform:'tiktok',original_url:'https://www.tiktok.com/@fixture/video/123456789',caption:'TikTok work'},{...post,id:'private',publication_status:'draft',caption:'PRIVATE'},{...post,id:'removed',source_available:false,caption:'REMOVED'}],services:[],collections:[]})));}
async function click(selector:string){await act(async()=>host.querySelector<HTMLButtonElement>(selector)!.click());}
it('starts All Work across sources and excludes private/unavailable media without provider frames',async()=>{await render();expect(host.querySelectorAll('.our-work-tile')).toHaveLength(4);expect(host.textContent).toContain('All Work');expect(host.textContent).not.toContain('PRIVATE');expect(host.textContent).not.toContain('REMOVED');expect(host.querySelector('iframe')).toBeNull();});
it('autoplays one muted selected video, toggles its surface and unloads it on keyboard navigation',async()=>{
 await render();await click('.our-work-tile:nth-child(2)');const video=host.querySelector('.our-work-viewer video') as HTMLVideoElement;expect(video.paused).toBe(false);expect(video.muted).toBe(true);
 await click('.our-work-video-surface');expect(video.paused).toBe(true);await click('.our-work-video-surface');expect(video.paused).toBe(false);
 await act(async()=>host.querySelector('dialog')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
 expect(video.paused).toBe(true);expect(video.getAttribute('src')).toBeNull();expect(host.querySelector('.our-work-viewer video')).toBeNull();expect(host.querySelector('iframe')).toBeNull();expect(document.activeElement).toBe(host.querySelector('dialog'));
});
it('keeps an accessible Play fallback after autoplay rejection and restores the original opener on close',async()=>{
 await render();vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('blocked','NotAllowedError'));await click('.our-work-tile:nth-child(2)');expect(host.querySelector('[aria-label="Play video"]')).toBeTruthy();
 await click('[aria-label="Play video"]');expect(host.querySelector('[aria-label="Pause video"]')).toBeTruthy();
 await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false);expect(document.activeElement).toBe(host.querySelectorAll('.our-work-tile')[1]);expect(scrollTo).toHaveBeenCalled();expect(document.body.style.overflow).not.toBe('hidden');
});
it('respects reduced motion and displays photographs without video controls',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true}));await render();await click('.our-work-tile:first-child');expect(host.querySelector('.our-work-viewer video')).toBeNull();expect(host.querySelector('[aria-label="Play video"]')).toBeNull();
 await act(async()=>host.querySelector('dialog')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();expect(host.querySelector('[aria-label="Play video"]')).toBeTruthy();
});
it('navigates when scrolling over the video surface and prevents momentum from skipping another item',async()=>{
 await render();await click('.our-work-tile:nth-child(2)');vi.spyOn(performance,'now').mockReturnValue(1000);
 await act(async()=>host.querySelector('.our-work-video-surface')!.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true})));
 expect(host.querySelector('.our-work-viewer video')).toBeNull();expect(host.querySelector('.our-work-social-player')?.getAttribute('aria-label')).toContain('Instagram');
 await act(async()=>host.querySelector('.our-work-stage')!.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true})));
 expect(host.querySelector('.our-work-social-player')?.getAttribute('aria-label')).toContain('Instagram');
});

it('does not apply portfolio scroll restoration to a newly opened service page',async()=>{
 await render();await click('.our-work-tile:first-child');await act(async()=>root.render(React.createElement('main',null,'Selected service')));expect(scrollTo).not.toHaveBeenCalled();expect(document.body.style.overflow).not.toBe('hidden');
});

it('shows delayed local video loading feedback and clears it on playback, pause and media error',async()=>{
 vi.useFakeTimers();try{
 await render();await click('.our-work-tile:nth-child(2)');const video=host.querySelector('dialog video')!;
 expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();await act(async()=>vi.advanceTimersByTime(199));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();await act(async()=>vi.advanceTimersByTime(1));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeTruthy();
 await act(async()=>video.dispatchEvent(new Event('playing')));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();
 await act(async()=>video.dispatchEvent(new Event('waiting')));await act(async()=>vi.advanceTimersByTime(200));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeTruthy();await click('.our-work-video-surface');expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();
 await click('.our-work-video-surface');await act(async()=>vi.advanceTimersByTime(200));await act(async()=>video.dispatchEvent(new Event('error')));expect(host.querySelector('.our-work-video-loading')).toBeNull();expect(host.querySelector('dialog [role=status]')?.textContent).toContain('unavailable');
 }finally{vi.useRealTimers();}
});
it('never leaves loading feedback after rejected autoplay',async()=>{
 vi.useFakeTimers();try{vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('blocked','NotAllowedError'));await render();await click('.our-work-tile:nth-child(2)');await act(async()=>vi.advanceTimersByTime(500));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();expect(host.querySelector('[aria-label="Play video"]')).toBeTruthy();}finally{vi.useRealTimers();}
});

it('waits for explicit playback under reduced motion and clears loading when the first frame arrives',async()=>{
 vi.useFakeTimers();try{vi.stubGlobal('matchMedia',()=>({matches:true}));await render();await click('.our-work-tile:nth-child(2)');await act(async()=>vi.advanceTimersByTime(500));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();await click('.our-work-video-surface');await act(async()=>vi.advanceTimersByTime(200));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeTruthy();await act(async()=>host.querySelector('dialog video')!.dispatchEvent(new Event('loadeddata')));expect(host.querySelector('.our-work-video-loading [role=status]')).toBeNull();}finally{vi.useRealTimers();}
});
