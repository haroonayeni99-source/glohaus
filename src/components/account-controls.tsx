"use client";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export function AccountControls() {
  const router = useRouter();
  return <button className="text-link" onClick={async () => { await createClient().auth.signOut(); router.replace("/"); router.refresh(); }}>Sign out</button>;
}
