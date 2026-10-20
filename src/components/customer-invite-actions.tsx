"use client";
import { useState } from "react";

export function CustomerInviteActions() {
  const [message,setMessage]=useState("");
  const url="https://www.glohaus.shop/";
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("GLOHAUS link copied"); }
    catch { setMessage("Unable to copy automatically"); }
  }
  async function share() {
    try {
      if(navigator.share) await navigator.share({title:"Explore GLOHAUS",text:"Discover beauty professionals on GLOHAUS",url});
      else await copy();
    } catch { setMessage("Sharing cancelled"); }
  }
  return <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
    <button type="button" className="button small" onClick={()=>void copy()}>Copy website link</button>
    <button type="button" className="button small" onClick={()=>void share()}>Share GLOHAUS</button>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
