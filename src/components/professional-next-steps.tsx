import Link from "next/link";
import { setupSteps, type SetupProgress } from "@/modules/professionals/setup";
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
        <h2>{next ? "Your next step" : "Your page is ready"}</h2>
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
          ? `${next[0]} to help customers discover and book your work.`
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
