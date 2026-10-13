"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function AccountControls() {
  const router = useRouter();
  return <button type="button" className="text-link glohaus-signout" onClick={async () => { await createClient().auth.signOut(); router.replace("/"); router.refresh(); }}>Sign out</button>;
}
