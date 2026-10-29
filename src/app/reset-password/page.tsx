import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth-form";
export default async function Reset() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect("/login");
  const client = await serverClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");
  return <AuthForm configured reset />;
}
