import { PlatformLabel } from "./platform-labels";
import Link from "next/link";
import { Brand } from "./brand";
export function PublicHeader() {
  return (
    <header className="site-header">
      <Brand />
      <nav aria-label="Main navigation">
        <Link href="/">Discover</Link>
        <Link href="/explore">
          <PlatformLabel name="Professionals" />
        </Link>
        <Link className="button small" href="/sign-in">
          Sign in
        </Link>
      </nav>
    </header>
  );
}
