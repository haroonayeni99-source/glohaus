"use client";
import { useEffect, useRef } from "react";

/** Counts visible, signed-in customer profile opens only; no visitor identity is stored. */
export function ProfessionalProfileOpenSignal({professionalId}:{professionalId:string}) {
  const sent=useRef(false);
  useEffect(()=>{
    const record=()=>{
      if(sent.current || document.visibilityState!=="visible") return;
      sent.current=true;
      void fetch("/api/v1/professional/profile-open",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({professionalId}),credentials:"same-origin",keepalive:true,
      }).catch(()=>undefined);
    };
    record();
    document.addEventListener("visibilitychange",record);
    return ()=>document.removeEventListener("visibilitychange",record);
  },[professionalId]);
  return null;
}
