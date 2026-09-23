import Image from "next/image";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { pageAccount } from "@/lib/page-access";
import { withIdentity } from "@/lib/db";
import { savedPosts } from "@/modules/engagement/repository";
import { AccessMessage } from "@/components/access-message";
import { PublicHeader } from "@/components/public-header";
import { BottomNavigation } from "@/components/bottom-navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Saved looks" };
export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const result = await pageAccount();
  if (!result.account)
    return (
      <div className="standalone-message">
        <AccessMessage code={result.error} />
      </div>
    );
  const value = Number((await searchParams).page || 1);
  const page =
    Number.isInteger(value) && value > 0 && value <= 1000 ? value : 1;
  const posts = await withIdentity(result.account.authId, (db) =>
    savedPosts(db, page),
  );
  return (
    <>
      <PublicHeader />
      <main id="main" className="catalog-page">
        <Link className="back-link" href="/account">
          ← Your account
        </Link>
        <p className="eyebrow">YOUR INSPIRATION COLLECTION</p>
        <h1>Saved looks</h1>
        {posts.length ? (
          <div className="saved-look-grid">
            {posts.slice(0, 40).map((post) => (
              <Link
                className="saved-look-card"
                href={`/posts/${post.id}`}
                key={post.id}
              >
                {post.asset_id ? (
                  <div className="saved-look-image">
                    <Image
                      src={`/api/media/${post.asset_id}`}
                      alt={post.title}
                      fill
                      sizes="(max-width: 640px) 50vw, 320px"
                    />
                  </div>
                ) : (
                  <div className="saved-look-placeholder">
                    <Bookmark size={32} aria-hidden />
                  </div>
                )}
                <div>
                  <span className="eyebrow">{post.kind}</span>
                  <h2>{post.title}</h2>
                  <p>
                    {post.business_name} · {post.city}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="catalog-empty">
            <Bookmark size={30} aria-hidden />
            <h2>Make room for inspiration.</h2>
            <p>Save a community post while browsing and find it here.</p>
            <Link className="button" href="/">
              Explore the feed
            </Link>
          </section>
        )}
        <nav className="booking-pagination" aria-label="Saved looks pages">
          {page > 1 && (
            <Link href={`/account/saved?page=${page - 1}`}>← Previous</Link>
          )}
          {posts.length > 40 && (
            <Link href={`/account/saved?page=${page + 1}`}>
              More saved looks →
            </Link>
          )}
        </nav>
      </main>
      <BottomNavigation active="profile" />
    </>
  );
}
