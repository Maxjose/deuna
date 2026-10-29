import { AuthForm } from "@/components/auth-form";
export default function Login() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return <AuthForm configured={configured} />;
}
