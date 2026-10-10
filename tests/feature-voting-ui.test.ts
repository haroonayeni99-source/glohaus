// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeatureVotes } from "@/components/feature-votes";
import { OwnerMarketingPanel } from "@/components/owner-marketing-panel";
import type { FeatureVoteItem } from "@/lib/feature-voting";
const router=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
const item:FeatureVoteItem={id:"11111111-1111-4111-8111-111111111111",title:"Clearer booking",description:"Make booking easier for everyone.",audience:"all",status:"open",vote_count:3,dislike_count:1,total_count:4,my_vote:false,my_choice:null,closes_at:"2099-10-10T12:00:00Z",voting_open:true};
let container:HTMLDivElement;let root:Root;
async function render(value=item){await act(async()=>root.render(React.createElement(FeatureVotes,{initial:[value]})));}
async function click(label:string){const target=[...container.querySelectorAll('button')].find(button=>button.textContent?.includes(label))!;expect(target).toBeTruthy();await act(async()=>target.click());}
beforeEach(async()=>{vi.clearAllMocks();vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubGlobal("fetch",vi.fn());container=document.createElement("div");document.body.append(container);root=createRoot(container);await render();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();vi.useRealTimers();});
it("saves a Dislike, shows server totals and changes the existing choice",async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({result:{...item,my_choice:"dislike",dislike_count:2,total_count:5}}));await click("Dislike");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({featureId:item.id,choice:"dislike"});
  expect(container.textContent).toContain("Dislike · 2");expect(container.textContent).toContain("5 total votes · 60% liked");expect(container.textContent).toContain("Your choice: Dislike");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({result:{...item,my_choice:"like",my_vote:true,vote_count:4,total_count:5}}));await click("Like ·");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).choice).toBe("like");expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain("Like");
});
it("unselects the same choice and uses authoritative totals rather than guesses",async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({result:{...item,my_choice:"like",my_vote:true,vote_count:4,total_count:5}}));await click("Like ·");
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({result:{...item,vote_count:20,dislike_count:5,total_count:25}}));await click("Like ·");
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).choice).toBe("none");expect(container.textContent).toContain("25 total votes · 80% liked");
});
it("preserves totals after a failure and allows retry",async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:{code:"UNAVAILABLE"}},{status:503}));await click("Dislike");
  expect(container.textContent).toContain("Please try again");expect(container.textContent).toContain("4 total votes");expect(container.querySelector('button')!.disabled).toBe(false);
});
it("disables both choices when the server reports expiry without hiding results",async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({error:{code:"VOTING_CLOSED"}},{status:409}));await click("Like ·");
  expect(container.textContent).toContain("Voting closed");expect(container.textContent).toContain("4 total votes");expect([...container.querySelectorAll('button')].every(button=>button.disabled)).toBe(true);
});
it("closes at the deadline while an already-open page is idle",async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2099-10-10T11:59:59Z"));
  // Remount for a fresh future deadline.
  await act(async()=>root.unmount());root=createRoot(container);await render();
  await act(async()=>{vi.advanceTimersByTime(1000);});expect(container.textContent).toContain("Voting closed");expect(fetch).not.toHaveBeenCalled();
});
it("shows anonymous Owner totals and sends the selected duration when publishing",async()=>{
  await act(async()=>root.render(React.createElement(OwnerMarketingPanel,{initial:{optedInUsers:0,queue:{pending:0,retrying:0,exhausted:0},campaigns:[],features:[item]}})));
  const totals=container.querySelector('.owner-feature-totals')!;expect(totals.textContent).toBe("Like 3Dislike 1Total 4");
  const form=container.querySelector('form')!;form.querySelector<HTMLInputElement>('[name="title"]')!.value="Clearer booking";form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value="Make booking easier for everyone.";form.querySelector<HTMLInputElement>('[name="durationDays"]')!.value="14";
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({featureId:item.id}));
  await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).durationDays).toBe(14);expect(container.textContent).toContain("published for 14 day(s)");expect(router.refresh).toHaveBeenCalledOnce();
});

it("reconciles refreshed server totals",async()=>{
  await render({...item,vote_count:8,dislike_count:2,total_count:10,voting_open:false});
  expect(container.textContent).toContain("10 total votes · 80% liked");expect(container.textContent).toContain("Voting closed");
});
