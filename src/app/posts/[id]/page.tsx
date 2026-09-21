import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { withIdentity } from "@/lib/db";
import type { PublicPost } from "@/modules/posts/domain";
import Home from "@/app/page";
export const dynamic = "force-dynamic";
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  if (!process.env.DATABASE_URL)
    return (
      <main className="catalog-page">
        <h1>This post is temporarily unavailable.</h1>
        <Link href="/">Explore GLOHAUS</Link>
      </main>
    );
  const post = await withIdentity(
    "",
    async (db) =>
      (
        await db.query<PublicPost>(
          "SELECT * FROM beauty.public_posts WHERE id=$1",
          [id],
        )
      ).rows[0],
  );
  if (!post) notFound();
  return Home({ searchParams: Promise.resolve({ post: id }) });
}
