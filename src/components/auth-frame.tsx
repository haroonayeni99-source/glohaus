import Link from "next/link";
import { Brand } from "./brand";
export function AuthFrame({
  children,
  title = "A little space.\nA lot of possibility.",
  description = "Your people, your craft, your next chapter. It starts with an account that’s yours.",
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className="auth-layout">
      <aside className="auth-story">
        <Brand inverse />
        <div>
          <p className="eyebrow">WELCOME TO YOUR NEXT CHAPTER</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="eyebrow">BEAUTIFULLY INDEPENDENT.</span>
      </aside>
      <main id="main" className="auth-main">
        <Link className="back-link" href="/">
          ← Back to glohaus
        </Link>
        <div className="auth-body">{children}</div>
        <p className="auth-footer">
          Your personal space for all things beauty.
        </p>
      </main>
    </div>
  );
}
