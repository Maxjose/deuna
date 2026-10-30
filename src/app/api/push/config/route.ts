export function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  return Response.json({ publicKey: publicKey || null }, { headers: { 'Cache-Control': 'no-store' } });
}
