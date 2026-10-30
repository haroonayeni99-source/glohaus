"use client";

import { useState } from "react";

export function ReferralShareActions({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  const url = `https://www.glohaus.shop/r/${encodeURIComponent(code)}?channel=professional-to-professional`;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch {
      setStatus("Copy unavailable on this device");
    }
  }
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join GLOHAUS", text: "Explore GLOHAUS using my referral link", url });
      } else {
        await copy(url);
      }
    } catch {
      setStatus("Sharing cancelled");
    }
  }
  return <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
    <button type="button" className="button small" onClick={()=>void copy(code)}>Copy code</button>
    <button type="button" className="button small" onClick={()=>void copy(url)}>Copy professional referral link</button>
    <button type="button" className="button small" onClick={()=>void copy(`https://www.glohaus.shop/r/${encodeURIComponent(code)}?channel=professional-introducing-own-customer`)}>Copy link for my customers</button>
    <button type="button" className="button small" onClick={()=>void share()}>Share</button>
    <span aria-live="polite" role="status">{status}</span>
  </div>;
}
