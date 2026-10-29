import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    redirect("/login");
  const client = await serverClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  return <Dashboard email={user.email || ""} userId={user.id} />;
}
