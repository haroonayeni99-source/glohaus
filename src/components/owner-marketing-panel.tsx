"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, ThumbsUp } from "lucide-react";
import { voteDeadline, type FeatureVoteItem } from "@/lib/feature-voting";
import { requireAdminResponse } from "@/lib/admin-response";

const customerPresets = [
  ["last_minute_availability","Last-minute availability","Optional appointment-slot campaign. No GLOHAUS discount is promised."],
  ["new_professionals","New professionals","Drive customers back to Explore when new professionals join."],
  ["followed_updates","New services & work","Promote new professional work and services through Discover."],
  ["saved_availability","Saved professional availability","Bring saved-interest customers back to current availability."],
  ["discover_weekly","Discover weekly","Promote bookable inspiration and professional content."],
  ["shop_recommendations","Shop recommendations","Bring opted-in customers back to GLOHAUS Shop."],
  ["rebooking","Rebooking","Bring previous customers back to booking history and availability."],
  ["customer_referral","Customer referral","Invite referrals without promising an unapproved cash reward."],
] as const;

const professionalPresets = [
  ["professional_growth","Professional growth","Encourage profile, content and availability improvements."],
  ["professional_features","New marketplace features","Promote new GLOHAUS professional tools."],
  ["professional_referrals","Professional referrals","Promote current referral opportunities."],
  ["academy","Professional Academy","Send educational and growth guidance."],
  ["milestones","Business milestones","Bring professionals back to their dashboard and progress."],
  ["shop_selling","Shop selling","Encourage better listings, stock and fulfilment."],
] as const;

type Overview = {
  features?:FeatureVoteItem[];
  optedInUsers:number;
  queue:{pending:number;retrying:number;exhausted:number};
  campaigns:{
    id:string;name:string;preset_key:string;status:string;
    recipient_count:number;sent_count:number;failed_count:number;
    booking_value_pence:number;glohaus_revenue_pence:number;promotion_cost_pence:number;
    created_at:string;
  }[];
};

export function OwnerMarketingPanel({initial}:{initial:Overview}) {
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const router=useRouter();

  async function launch(preset:string,name:string) {
    if(!window.confirm(`Launch the preset campaign “${name}” to eligible opted-in users?`)) return;
    setBusy(preset); setNotice("");
    try{
      const response=await fetch("/api/v1/admin/marketing",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({type:"launch",preset}),
      });
      await requireAdminResponse(response, "Campaign could not be launched.");
      const data=await response.json().catch(()=>null) as {campaign?:{recipients?:number}}|null;
      setNotice(`Campaign queued for ${data?.campaign?.recipients ?? 0} opted-in recipient(s).`);
      router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Campaign could not be launched.");}
    finally{setBusy("");}
  }

  async function createPoll(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element=event.currentTarget;
    const form=new FormData(element);
    setBusy("poll"); setNotice("");
    try{
      const response=await fetch("/api/v1/admin/marketing",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          type:"feature",
          audience:form.get("audience"),
          title:form.get("title"),
          description:form.get("description"),
          durationDays:Number(form.get("durationDays")),
        }),
      });
      await requireAdminResponse(response, "Feature vote could not be created.");
      setNotice(`Feature vote published for ${form.get("durationDays")} day(s). Likes, dislikes and totals are available below after refresh.`);
      element.reset();
      router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Feature vote could not be created.");}
    finally{setBusy("");}
  }

  return (
    <div className="owner-marketing-panel">
      <div className="analytics-grid">
        <article><strong>{initial.optedInUsers}</strong><span>Users opted into at least one marketing category</span></article>
        <article><strong>{initial.campaigns.length}</strong><span>Recent campaigns tracked</span></article>
        <article><strong>{initial.queue.pending}</strong><span>Marketing emails waiting to send</span></article>
        <article><strong>{initial.queue.retrying}</strong><span>Marketing emails retrying</span></article>
        <article><strong>{initial.queue.exhausted}</strong><span>Marketing emails needing attention</span></article>
      </div>

      <h3>Customer campaign presets</h3>
      <div className="marketing-preset-grid">
        {customerPresets.map(([key,name,description])=>(
          <article className="marketing-preset-card" key={key}>
            <Megaphone size={20} aria-hidden />
            <h4>{name}</h4>
            <p>{description}</p>
            <button disabled={Boolean(busy)} onClick={()=>void launch(key,name)}>
              {busy===key?"Queueing…":"Launch preset"}
            </button>
          </article>
        ))}
      </div>

      <h3>Professional campaign presets</h3>
      <div className="marketing-preset-grid">
        {professionalPresets.map(([key,name,description])=>(
          <article className="marketing-preset-card" key={key}>
            <Megaphone size={20} aria-hidden />
            <h4>{name}</h4>
            <p>{description}</p>
            <button disabled={Boolean(busy)} onClick={()=>void launch(key,name)}>
              {busy===key?"Queueing…":"Launch preset"}
            </button>
          </article>
        ))}
      </div>

      <h3>Private feature vote</h3>
      <form className="editor-form" onSubmit={createPoll}>
        <label>Audience
          <select name="audience" defaultValue="all">
            <option value="all">All signed-in users</option>
            <option value="customer">Customers</option>
            <option value="professional">Professionals</option>
          </select>
        </label>
        <label>Feature or idea
          <input name="title" minLength={5} maxLength={140} required placeholder="e.g. Waitlist for fully booked professionals" />
        </label>
        <label>Short explanation
          <textarea name="description" minLength={10} maxLength={800} required placeholder="Explain what users would be voting for." />
        </label>
        <label>Voting duration (days)
          <input name="durationDays" type="number" min={1} max={90} step={1} defaultValue={7} required aria-describedby="vote-duration-help" />
        </label>
        <p id="vote-duration-help">Choose 1–90 days. Voting closes automatically; final results stay visible.</p>
        <button className="button" disabled={Boolean(busy)}>
          <ThumbsUp size={17} aria-hidden /> {busy==="poll"?"Publishing…":"Publish private vote"}
        </button>
      </form>

      <section className="owner-feature-results" aria-label="Feature vote results">
        <h3>Feature vote results</h3>
        <p>Totals are anonymous. Voting ends at the time shown.</p>
        {(initial.features ?? []).map(feature => (
          <article className="owner-feature-result" key={feature.id}>
            <h4>{feature.title}</h4>
            <p>{feature.audience === "all" ? "All signed-in users" : feature.audience === "customer" ? "Customers" : "Professionals"} · {feature.voting_open ? "Voting open" : "Voting closed"}</p>
            <p>{feature.voting_open ? "Ends" : "Ended"} <time dateTime={feature.closes_at}>{voteDeadline(feature.closes_at)} UK time</time></p>
            <div className="owner-feature-totals">
              <span>Like <strong>{feature.vote_count}</strong></span>
              <span>Dislike <strong>{feature.dislike_count}</strong></span>
              <span>Total <strong>{feature.total_count}</strong></span>
            </div>
          </article>
        ))}
        {!initial.features?.length && <p>No feature votes have been published yet.</p>}
        <button type="button" className="feature-vote-button" onClick={() => router.refresh()} disabled={Boolean(busy)}>Refresh vote results</button>
      </section>

      <h3>Recent campaign performance</h3>
      <div className="service-edit-list">
        {initial.campaigns.map((campaign)=>(
          <article className="service-edit-row" key={campaign.id}>
            <div>
              <h4>{campaign.name}</h4>
              <p>{campaign.status} · {campaign.sent_count}/{campaign.recipient_count} sent · {campaign.failed_count} failed</p>
              <small>
                Booking value £{(campaign.booking_value_pence/100).toFixed(2)} ·
                GLOHAUS revenue £{(campaign.glohaus_revenue_pence/100).toFixed(2)} ·
                Promotion cost £{(campaign.promotion_cost_pence/100).toFixed(2)}
              </small>
            </div>
          </article>
        ))}
        {!initial.campaigns.length && <p className="lead">No marketing campaigns have been launched yet.</p>}
      </div>
      {notice && <p className="form-notice" role="status">{notice}</p>}
    </div>
  );
}
