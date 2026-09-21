import "server-only";
import type { SqlClient } from "@/modules/accounts/repository";
import { AccessError } from "@/modules/accounts/domain";
export async function replaceProfilePhoto(
  db: SqlClient,
  professionalId: string,
  photo: { id: string; path: string; alt: string },
) {
  if (
    !(
      await db.query(
        "SELECT id FROM beauty.professional_profiles WHERE id=$1",
        [professionalId],
      )
    ).rows.length
  )
    throw new AccessError("FORBIDDEN", 403);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  const old = (
    await db.query<{ blob_path: string }>(
      "SELECT blob_path FROM beauty.profile_photos WHERE professional_id=$1",
      [professionalId],
    )
  ).rows[0];
  await db.query(
    `INSERT INTO beauty.profile_photos(id,professional_id,blob_path,alt_text) VALUES($1,$2,$3,$4) ON CONFLICT(professional_id) DO UPDATE SET id=excluded.id,blob_path=excluded.blob_path,alt_text=excluded.alt_text`,
    [photo.id, professionalId, photo.path, photo.alt],
  );
  return old?.blob_path;
}
export async function removeProfilePhoto(
  db: SqlClient,
  professionalId: string,
) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    professionalId,
  ]);
  return (
    await db.query<{ blob_path: string }>(
      "DELETE FROM beauty.profile_photos WHERE professional_id=$1 RETURNING blob_path",
      [professionalId],
    )
  ).rows[0]?.blob_path;
}
