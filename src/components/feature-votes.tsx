"use client";

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

type Feature = {
  id:string;
  audience:"customer"|"professional"|"all";
  title:string;
  description:string;
  status:string;
  vote_count:number;
  my_vote:boolean;
};

export function FeatureVotes({initial}:{initial:Feature[]}) {
  const [items,setItems]=useState(initial);
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");

  async function toggle(id:string) {
    setBusy(id); setNotice("");
    try {
      const response=await fetch("/api/v1/features/vote",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({featureId:id}),
      });
      if(!response.ok) throw new Error("Your vote could not be updated.");
      const data=await response.json() as {voted:boolean};
      setItems((current)=>current.map((item)=>
        item.id===id
          ? {...item,my_vote:data.voted,vote_count:Math.max(0,item.vote_count+(data.voted?1:-1))}
          : item
      ));
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Your vote could not be updated.");
    } finally { setBusy(null); }
  }

  return (
    <section className="feature-vote-list">
      {items.map((item)=>(
        <article className="feature-vote-card" key={item.id}>
          <div>
            <span className="eyebrow">{item.status.replaceAll("_"," ")}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </div>
          <button
            type="button"
            className={item.my_vote?"feature-vote-button is-voted":"feature-vote-button"}
            aria-pressed={item.my_vote}
            disabled={busy===item.id}
            onClick={()=>void toggle(item.id)}
          >
            <ThumbsUp size={17} aria-hidden />
            {item.my_vote?"Voted":"Vote"} · {item.vote_count}
          </button>
        </article>
      ))}
      {!items.length && <p className="lead">There are no active GLOHAUS feature votes for your account type yet.</p>}
      {notice && <p className="form-error" role="alert">{notice}</p>}
    </section>
  );
}
