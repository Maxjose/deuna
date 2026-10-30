import { ImageResponse } from "next/og";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: input } = await params;
  if (!["180", "192", "512"].includes(input))
    return new Response("Not found", { status: 404 });
  const size = Number(input);
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        background: "#122033",
        color: "#ffffff",
        fontWeight: 800,
        fontSize: size * 0.4,
        letterSpacing: -size * 0.03,
      }}
    >
      D<span style={{ color: "#b4f36a" }}>1</span>
    </div>,
    { width: size, height: size },
  );
}
