import type { ReactNode } from "react";
/** Shared presentation only; content and actions remain owned by each page. */
export function WorkspaceIntro({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return <header className="workspace-intro"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children ? <div className="workspace-intro-description">{children}</div> : null}</header>;
}
