import Link from "next/link";
import { Crown } from "lucide-react";
export function Brand({
  inverse = false,
  pro = false,
}: {
  inverse?: boolean;
  pro?: boolean;
}) {
  return (
    <Link
      href="/"
      className={`brand${inverse ? " inverse" : ""}`}
      aria-label={pro ? "GLOHAUS PRO home" : "GLOHAUS home"}
    >
      <Crown className="brand-crown" size={18} strokeWidth={2.2} aria-hidden />
      <span>GLOHAUS</span>{pro && <span className="brand-pro"> PRO</span>}
    </Link>
  );
}
