import Link from "next/link";
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand${inverse ? " inverse" : ""}`}
      aria-label="glohaus home"
    >
      glohaus<span>.</span>
    </Link>
  );
}
