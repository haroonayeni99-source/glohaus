import Link from "next/link";
import { pageAccount } from "@/lib/page-access";
import { AccessMessage } from "@/components/access-message";
import { AuthFrame } from "@/components/auth-frame";
import { ownerEngagement } from "@/modules/website-analytics/repository";
import { pageLabels, type Page } from "@/modules/website-analytics/domain";
import "@/components/engagement.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Website Engagement | GLOHAUS",
  robots: { index: false, follow: false },
};
const duration = (n: number) =>
  n < 60000
    ? `${Math.round(n / 1000)}s`
    : `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`;
const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export default async function EngagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    device?: string;
  }>;
}) {
  const access = await pageAccount("admin", "/admin/engagement");
  if (!access.account)
    return (
      <AuthFrame>
        <AccessMessage code={access.error ?? undefined} />
      </AuthFrame>
    );
  if (!access.account.roles.includes("owner"))
    return (
      <main className="engagement-workspace">
        <h1>Owner access required</h1>
        <p>This report is restricted to the GLOHAUS Owner.</p>
      </main>
    );
  const params = await searchParams;
  const { result, error } = await ownerEngagement(params)
    .then((result) => ({ result, error: "" }))
    .catch((e) => ({
      result: null,
      error:
        e instanceof Error && e.message.startsWith("Choose")
          ? e.message
          : "Engagement reporting is temporarily unavailable. No figures have been estimated.",
    }));
  const report = result?.report;
  return (
    <main id="main" className="engagement-workspace">
      <Link href="/admin">← Owner Control Centre</Link>
      <header>
        <p className="eyebrow">OWNER ONLY · WEBSITE INSIGHTS</p>
        <h1>Engagement & customer journeys</h1>
        <p>
          Understand where customers spend time, what they explore and where
          they leave before completing a booking or purchase.
        </p>
        <p>
          <Link href="/admin/growth">Growth & acquisition</Link> ·{" "}
          <Link href="/admin#analytics">Revenue & booking reports</Link>
        </p>
      </header>
      <form className="engagement-filters" method="get">
        <label>
          Reporting period
          <select name="period" defaultValue={params.period ?? "month"}>
            <option value="day">Today</option>
            <option value="week">Last 7 days</option>
            <option value="month">Last 30 days</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={params.from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={params.to} />
        </label>
        <label>
          Device
          <select name="device" defaultValue={result?.device ?? "all"}>
            <option value="all">All devices</option>
            <option value="mobile">Mobile</option>
            <option value="tablet">Tablet</option>
            <option value="desktop">Desktop</option>
          </select>
        </label>
        <button className="button" type="submit">
          Apply filters
        </button>
      </form>
      <p>
        Dates use UTC. Unique visitors are consenting browser identifiers, not
        identified people; separate devices and cleared storage count
        separately. Reports cover up to 90 retained days.
      </p>
      {error && (
        <p className="engagement-status" role="alert">
          {error}
        </p>
      )}
      {result?.state === "disabled" && (
        <section className="engagement-status" role="status">
          <h2>Tracking is not activated</h2>
          <p>
            The new engagement collector is disabled. Reporting and consent
            controls are prepared; production storage, retention scheduling and
            end-to-end verification must pass before activation. Existing
            revenue and growth reports remain available above.
          </p>
          <p>
            There are no historical engagement figures to import. Customer
            activity will only be recorded after activation and explicit
            permission.
          </p>
        </section>
      )}
      {result?.state === "limit" && (
        <p role="alert">
          This period exceeds the report’s 10,000 page-view safety limit. Choose
          a shorter date range. Partial totals are not shown.
        </p>
      )}
      {report && (
        <>
          <div className="engagement-grid">
            {(
              [
                ["Page views", report.views.toLocaleString()],
                ["Unique visitors", report.visitors.toLocaleString()],
                ["Sessions", report.sessions.toLocaleString()],
                ["Average active session", duration(report.averageSessionMs)],
              ] as const
            ).map(([label, value]) => (
              <section
                className="admin-detail-card engagement-metric"
                key={label}
              >
                <span>{label}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          {!report.views && (
            <p role="status">
              No consented page views in this period. This is not a count of all
              website visitors.
            </p>
          )}
          <section className="admin-detail-card">
            <h2>Page performance</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <caption>
                  Active time excludes background tabs and idle periods.
                  Conversion is session attribution, not proof a page caused a
                  sale.
                </caption>
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Views</th>
                    <th>Visitors</th>
                    <th>Average engagement</th>
                    <th>Median engagement</th>
                    <th>Average maximum scroll</th>
                    <th>Clicks</th>
                    <th>Converted sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPage.map((p) => (
                    <tr key={p.page}>
                      <th scope="row">{pageLabels[p.page]}</th>
                      <td>{p.views}</td>
                      <td>{p.visitors}</td>
                      <td>{duration(p.averageMs)}</td>
                      <td>{duration(p.medianMs)}</td>
                      <td>{Math.round(p.scroll)}%</td>
                      <td>{p.clicks}</td>
                      <td>
                        {p.converted} ({percent(p.conversionRate)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="admin-detail-card">
            <h2>Mobile, tablet & desktop</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Device</th>
                    <th>Views</th>
                    <th>Visitors</th>
                    <th>Average active session</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparisons.map((d) => (
                    <tr key={d.device}>
                      <th scope="row">{d.device}</th>
                      <td>{d.views}</td>
                      <td>{d.visitors}</td>
                      <td>{duration(d.averageSessionMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Device groups use viewport size at page entry. A tablet in desktop
              mode may be grouped as desktop.
            </p>
          </section>
          <section className="admin-detail-card">
            <h2>Conversion funnels</h2>
            <p>
              Ordered stages within the same consented session. Paid completion
              must be verified by the server; visiting checkout does not count.
              Hosted Stripe screens are excluded. Return-based attribution can
              miss customers who close the payment window.
            </p>
            <div className="engagement-grid">
              {(
                [
                  ["Booking journey", report.bookingFunnel],
                  ["Shopping journey", report.purchaseFunnel],
                ] as const
              ).map(([label, steps]) => (
                <div key={label}>
                  <h3>{label}</h3>
                  <ol>
                    {steps.map((step) => (
                      <li key={step.stage}>
                        {pageLabels[step.stage as Page] ??
                          step.stage.replaceAll("_", " ")}
                        : <strong>{step.count}</strong>
                        <progress
                          aria-label={`${step.stage} sessions`}
                          value={step.count}
                          max={Math.max(1, steps[0].count)}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
          <section className="admin-detail-card">
            <h2>Discover video performance</h2>
            <p>
              {report.profileClicks} clicks through to professional profiles. An
              impression requires at least half the video to be visible. Watch
              time excludes hidden, unfocused, paused and seeking periods. A
              completion requires watching at least 95% of the duration; replay
              means a completed video looping back to the start. External
              TikTok/Instagram embeds without player telemetry are not
              estimated.
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Video asset</th>
                    <th>Impressions</th>
                    <th>Watch time</th>
                    <th>Starts</th>
                    <th>Completions</th>
                    <th>Completion rate</th>
                    <th>Replays</th>
                  </tr>
                </thead>
                <tbody>
                  {report.videos.map((v) => (
                    <tr key={v.id}>
                      <th scope="row">{v.id.slice(0, 8)}</th>
                      <td>{v.impressions}</td>
                      <td>{duration(v.watchMs)}</td>
                      <td>{v.starts}</td>
                      <td>{v.completions}</td>
                      <td>
                        {percent(v.starts ? v.completions / v.starts : 0)}
                      </td>
                      <td>{v.replays}</td>
                    </tr>
                  ))}
                  {!report.videos.length && (
                    <tr>
                      <td colSpan={7}>
                        No measured first-party video activity.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="admin-detail-card">
            <h2>Common customer journeys</h2>
            <p>
              Only aggregate paths with at least five sessions are shown.
              Individual visitor histories are not displayed.
            </p>
            {report.journeys.length ? (
              <ul>
                {report.journeys.map(([path, count]) => (
                  <li key={path}>
                    {path
                      .split(" → ")
                      .map((p) => pageLabels[p as Page])
                      .join(" → ")}
                    : {count} sessions
                  </li>
                ))}
              </ul>
            ) : (
              <p>Not enough matching journeys to display safely.</p>
            )}
          </section>
          <section className="admin-detail-card">
            <h2>Worth investigating</h2>
            <p>
              Review pages with at least 20 sessions, an average of one minute
              of active engagement and under 2% converted sessions. These
              signals suggest an investigation; they do not establish a
              usability fault.
            </p>
            {report.byPage
              .filter((p) => p.investigate)
              .map((p) => (
                <p className="engagement-insight" key={p.page}>
                  <strong>{pageLabels[p.page]}</strong>: {duration(p.averageMs)}{" "}
                  average engagement; {percent(p.conversionRate)} conversion.
                </p>
              ))}
            {!report.byPage.some((p) => p.investigate) && (
              <p>No pages currently meet this rule.</p>
            )}
          </section>
        </>
      )}
      <section className="admin-detail-card">
        <h2>Measurement & privacy</h2>
        <p>
          Coverage: Home, Discover, Shop, professional profiles, service
          selection, registration, booking and checkout. Only explicitly
          permitted activity is eligible. No names, form contents, search text,
          messages, raw page addresses or payment credentials are included. This
          feature does not record the screen or change booking/payment
          decisions.
        </p>
        <p>
          Repeated snapshots update one page view; refreshes create a new view.
          Active session time is the sum of page engagement. Maximum scroll
          includes the Discover feed’s scrolling area. Journey reports are
          aggregated and exclude private operational workspaces.
        </p>
      </section>
    </main>
  );
}
