"use client";

import Link from "next/link";
import { Crown } from "lucide-react";
import { useProfessionalAccount } from "./auth-session";
export function Brand({
  inverse = false,
  pro = false,
}: {
  inverse?: boolean;
  pro?: boolean;
}) {
  const professionalAccount = useProfessionalAccount();
  return (
    <Link
      href="/"
      className={`brand${inverse ? " inverse" : ""}`}
      aria-label={pro ? "GLOHAUS PRO home" : "GLOHAUS home"}
    >
      {professionalAccount && <Crown className="brand-crown" size={18} strokeWidth={2.2} aria-hidden="true" />}
      <span>GLOHAUS</span>{pro && <span className="brand-pro"> PRO</span>}
    </Link>
  );
}
