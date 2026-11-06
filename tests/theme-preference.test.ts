// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolveTheme, themeBootstrap } from '@/lib/theme-preference';
let dark=false;
let changes:Array<()=>void>=[];
let root:ReturnType<typeof createRoot>;
let container:HTMLDivElement;
beforeEach(()=>{
 vi.resetModules();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);localStorage.clear();dark=false;changes=[];
 vi.stubGlobal('matchMedia',vi.fn(()=>({matches:dark,addEventListener:(_name:string,callback:()=>void)=>changes.push(callback),removeEventListener:vi.fn()})));
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();delete document.documentElement.dataset.theme;vi.restoreAllMocks();vi.unstubAllGlobals();});
it('preserves explicit preference and follows the OS only in System mode',()=>{expect(resolveTheme('light',true)).toBe('light');expect(resolveTheme('night',false)).toBe('night');expect(resolveTheme('system',true)).toBe('night');expect(resolveTheme(null,false)).toBe('light');});
it('bootstraps the OS theme even if storage is unavailable',()=>{dark=true;vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('blocked')});window.eval(themeBootstrap);expect(document.documentElement.dataset.theme).toBe('night');expect(document.documentElement.style.colorScheme).toBe('dark');});
it('keeps explicit saved Light during hydration on a dark device',async()=>{dark=true;localStorage.setItem('glohaus-theme','light');window.eval(themeBootstrap);const {ThemeToggle}=await import('@/components/theme-toggle');await act(async()=>root.render(React.createElement(ThemeToggle)));expect(document.documentElement.dataset.theme).toBe('light');expect(container.querySelector('select')?.value).toBe('light');});
it('updates System mode when the device changes',async()=>{const {ThemeToggle}=await import('@/components/theme-toggle');await act(async()=>root.render(React.createElement(ThemeToggle)));await act(async()=>{dark=true;changes.forEach(f=>f());});expect(document.documentElement.dataset.theme).toBe('night');});
it('keeps a manual choice usable when saving storage is blocked',async()=>{vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked')});const {ThemeToggle}=await import('@/components/theme-toggle');await act(async()=>root.render(React.createElement(ThemeToggle)));const select=container.querySelector('select')!;await act(async()=>{select.value='night';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(document.documentElement.dataset.theme).toBe('night');expect(select.value).toBe('night');});
it('restores the compact floating control while keeping the device preference available',async()=>{const {ThemeToggle}=await import('@/components/theme-toggle');await act(async()=>root.render(React.createElement(ThemeToggle)));expect(container.querySelector('.theme-toggle-layer summary')?.getAttribute('aria-label')).toBe('Appearance settings');expect([...container.querySelectorAll('option')].map(o=>o.value)).toEqual(['system','light','night']);});
