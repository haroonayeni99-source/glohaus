import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";

export function AuthGate({
  returnTo,
  onClose,
}: {
  returnTo: string;
  onClose: () => void;
}) {
  const suffix = `returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <div className="auth-gate-backdrop" role="presentation">
      <section
        className="auth-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
      >
        <button
          className="auth-gate-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <p className="eyebrow">ONE QUICK STEP</p>
        <h2 id="auth-gate-title">Ready to book?</h2>
        <p>
          Create a free GLOHAUS account to confirm this appointment. Your
          service, date and time will stay selected.
        </p>
        <Link className="button full-width" href={`/sign-up?${suffix}`}>
          Create a free account <ArrowUpRight size={18} />
        </Link>
        <Link className="text-link" href={`/sign-in?${suffix}`}>
          Already have an account? Sign in
        </Link>
      </section>
    </div>
  );
}
