"use client";

import { useState } from "react";

type Draft={enabled:boolean;customerCreditPence:number;professionalRewardPence:number};
export function OwnerGrowthRewardDraft({initial}:{initial:Draft}) {
  const [customer,setCustomer]=useState(String(initial.customerCreditPence));
  const [professional,setProfessional]=useState(String(initial.professionalRewardPence));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function save(event:React.FormEvent) {
    event.preventDefault();
    if(busy)return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/v1/admin/growth-reward-draft",{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({customerCreditPence:Number(customer),professionalRewardPence:Number(professional)}),
      });
      if(!response.ok)throw new Error();
      setMessage("Reward amounts saved as a draft. All rewards remain OFF.");
    } catch {
      setMessage("Could not save reward draft. Check your Owner session and try again.");
    } finally {setBusy(false);}
  }
  return <section className="admin-detail-card" style={{padding:24,marginTop:20}}>
    <p className="eyebrow">OWNER CONTROL · REWARDS OFF</p>
    <h2>Referral rewards — draft settings</h2>
    <p>Prepare future amounts. Saving will not enable rewards, issue credits or change Stripe payments.</p>
    <form onSubmit={save} style={{display:"grid",gap:12,maxWidth:400}}>
      <label>Customer booking credit (GBP)
        <input type="number" min="0" max="50" step="0.01" required value={Number(customer)/100}
          onChange={e=>setCustomer(String(Math.round(Number(e.target.value)*100)))}/>
      </label>
      <label>Professional referral reward value (GBP)
        <input type="number" min="0" max="50" step="0.01" required value={Number(professional)/100}
          onChange={e=>setProfessional(String(Math.round(Number(e.target.value)*100)))}/>
      </label>
      <button type="submit" className="button" disabled={busy}>{busy?"Saving…":"Save disabled draft"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
    <p><strong>Reward programme status: OFF.</strong> A separate reviewed activation and fraud-control rollout is required.</p>
  </section>;
}
