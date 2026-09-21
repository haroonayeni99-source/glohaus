import Link from "next/link";
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
      GLOHAUS{pro && <span className="brand-pro"> PRO</span>}
    </Link>
  );
}
