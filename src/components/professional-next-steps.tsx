import Link from "next/link";
import { setupSteps, type SetupProgress } from "@/modules/professionals/setup";
const stepGuidance = {
  profile:
    "Add your business name, a short introduction and the area you serve.",
  services:
    "Add a service with its price and duration so clients know what they can book.",
  availability:
    "Choose the days and times clients can book you. You can add time off separately.",
  portfolio:
    "Add a photo of your work, then publish it when you are ready to share it.",
  published:
    "Preview your page, then choose Published in your profile settings to make it visible.",
} satisfies Record<keyof SetupProgress, string>;
export function ProfessionalNextSteps({
  progress,
}: {
  progress: SetupProgress;
}) {
  const complete = setupSteps.filter(([, , key]) => progress[key]).length;
  const next = setupSteps.find(([, , key]) => !progress[key]);
  return (
    <section
      className="pro-panel professional-next-steps"
      aria-label="Profile completion and next step"
    >
      <div className="pro-panel-title">
        <h2>{next ? "Your next step" : "Setup checklist complete"}</h2>
        <strong>
          {complete} / {setupSteps.length} complete
        </strong>
      </div>
      <progress
        aria-label="Profile completion"
        value={complete}
        max={setupSteps.length}
      />
      <p>
        {next
          ? stepGuidance[next[2]]
          : "Keep your portfolio and availability up to date so customers know what they can book."}
      </p>
      <div className="editor-actions">
        <Link
          className="button small"
          href={next?.[1] || "/professional/availability"}
        >
          {next?.[0] || "Check your availability"}
        </Link>
        <Link href="/professional/setup">View all setup steps</Link>
      </div>
      <details>
        <summary>Profile checklist</summary>
        <ul>
          {setupSteps.map(([label, href, key]) => (
            <li key={key}>
              <span>{progress[key] ? "✓ Ready" : "To do"}</span>{" "}
              <Link href={href}>{label}</Link>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
