import { GlohausHeader } from "./glohaus-header";
export function PublicHeader({ professional = false }: { professional?: boolean }) {
  return <GlohausHeader professional={professional} />;
}
