// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
const route=vi.hoisted(()=>({path:'/discover'}));
vi.mock('next/navigation',()=>({usePathname:()=>route.path}));
import {SiteFooter} from '@/components/site-footer';
it('makes the real website footer available on Discover',()=>{route.path='/discover';const html=renderToStaticMarkup(React.createElement(SiteFooter));expect(html).toContain('aria-label="Website footer"');expect(html).toContain('href="/privacy"');expect(html).toContain('href="/contact"');});
it('keeps operational workspaces and messages free of a global footer',()=>{for(const path of ['/admin','/professional','/professional/tools','/messages','/maintenance']){route.path=path;expect(renderToStaticMarkup(React.createElement(SiteFooter))).toBe('');}});
