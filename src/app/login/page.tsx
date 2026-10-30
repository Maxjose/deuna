import { AuthForm } from "@/components/auth-form";
import { serverClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Login() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  if (configured) {
    const client = await serverClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user) redirect("/dashboard");
  }
  return <AuthForm configured={configured} />;
}
