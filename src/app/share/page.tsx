import { FeedPage } from "../discover/page";

export const dynamic = "force-dynamic";

export default async function SharePage(props: {
  searchParams: Promise<{
    view?: string;
    feed?: string;
    page?: string;
    post?: string;
  }>;
}) {
  return FeedPage({ ...props, mode: "share" });
}
