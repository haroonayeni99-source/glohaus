// @vitest-environment jsdom
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,expect,it,vi} from 'vitest';
import {adminTaskGroups} from '@/components/admin-tool-guide';
import {DiscoverNavigation} from '@/components/discover-navigation';
const mocks=vi.hoisted(()=>({query:vi.fn(),identities:[] as string[]}));
vi.mock('@/lib/db',()=>({withIdentity:async(id:string,work:(db:unknown)=>unknown)=>{mocks.identities.push(id);return work({query:mocks.query});}}));
vi.mock('@/components/marketing-preferences-form',()=>({MarketingPreferencesForm:({initial}:{initial:object})=>React.createElement('div',{'data-testid':'marketing'},JSON.stringify(initial))}));
vi.mock('@/components/professional-notification-settings',()=>({ProfessionalNotificationSettings:({audience,initial}:{audience:string;initial:object})=>React.createElement('div',{'data-testid':'alerts','data-audience':audience},JSON.stringify(initial))}));
import {CommunicationsSettings} from '@/components/communications-settings';
beforeEach(()=>{mocks.query.mockReset();mocks.identities=[];});
it('loads existing customer choices with the same verified identity and keeps inbox separate',async()=>{
 mocks.query.mockImplementation(async(sql:string)=>({rows:[{data:sql.includes('marketing')?{customer_offers:true,shop:false}:{preferences:[{category:'bookings',push:false}],devices:[{id:'existing-device'}]}}]}));
 const html=renderToStaticMarkup(await CommunicationsSettings({authId:'verified-customer'}));
 expect(mocks.identities).toEqual(['verified-customer','verified-customer']);
 expect(html).toContain('data-audience="customer"');expect(html).toContain('existing-device');expect(html).toContain('&quot;customerOffers&quot;:true');expect(html).toContain('&quot;shop&quot;:false');
 expect(html).toContain('href="/notifications"');expect(mocks.query.mock.calls.every(([sql])=>sql.startsWith('SELECT '))).toBe(true);
});
it('does not render default consent controls when marketing fails, while alert settings remain usable',async()=>{
 mocks.query.mockImplementation(async(sql:string)=>{if(sql.includes('marketing'))throw Error('offline');return {rows:[{data:{preferences:[],devices:[]}}]};});
 const html=renderToStaticMarkup(await CommunicationsSettings({authId:'verified-pro',professional:true}));
 expect(html).not.toContain('data-testid="marketing"');expect(html).toContain('data-audience="professional"');expect(html).toContain('existing consent has not changed');expect(html).toContain('/notifications?view=professional');
 expect(mocks.query).toHaveBeenCalledWith('SELECT beauty.my_notification_settings() AS data');
});
it('preserves marketing choices when alert settings fail independently',async()=>{
 mocks.query.mockImplementation(async(sql:string)=>{if(!sql.includes('marketing'))throw Error('offline');return {rows:[{data:{customer_offers:false}}]};});
 const html=renderToStaticMarkup(await CommunicationsSettings({authId:'verified-customer'}));
 expect(html).not.toContain('data-testid="alerts"');expect(html).toContain('data-testid="marketing"');expect(html).toContain('saved choices have not changed');
});
it('retains every existing Owner/Admin section exactly once after regrouping',()=>{
 const ids=adminTaskGroups.flatMap(g=>g.ids);
 const expected='overview settings categories product-categories users professionals professional-policies professional-activity live-access bookings orders reviews reports support content payment-disputes refund-appeals payments analytics arrival-management push-delivery-health website-status marketing homepage-media profile-examples booking-fee shop-fees auth-accounts founding-programme professional-commission referrals staff backend-health payment-readiness email-readiness email-delivery-health audit'.split(' ');
 expect([...ids].sort()).toEqual(expected.sort());expect(new Set(ids).size).toBe(ids.length);
});
it('keeps inspiration, following content, followed profiles and direct professional search distinct',()=>{
 const wrapper=document.createElement('div');wrapper.innerHTML=renderToStaticMarkup(React.createElement(DiscoverNavigation,{active:'following'}));
 expect(wrapper.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/discover?feed=following');
 expect([...wrapper.querySelectorAll('a')].map(a=>a.getAttribute('href'))).toEqual(['/discover','/discover?feed=following','/discover?view=saved','/account/following','/explore']);
});
