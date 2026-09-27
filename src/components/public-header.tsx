import { GlohausHeader } from "./glohaus-header";

export function PublicHeader({
  professional = false,
  signedIn = false,
}: {
  professional?: boolean;
  signedIn?: boolean;
}) {
  return <GlohausHeader professional={professional} signedIn={signedIn} />;
}
