import { db } from "@/lib/db";
import { isSiteImageKey } from "@/lib/site-images";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isSiteImageKey(key)) return new Response("Not found", { status: 404 });

  const row = await db.siteImage.findUnique({ where: { key }, select: { data: true, mime: true } });
  if (!row) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
