import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sydneyDateMedium, sydneyTimeShort } from "@/lib/time";
import {
  FAQ_MAX_ITEMS,
  FAQ_QUESTION_MAX,
  SITE_CONTENT,
  SITE_CONTENT_GROUPS,
  getSiteContent,
  isSiteContentKey,
  type SiteContentKey,
} from "@/lib/site-content";
import { SITE_IMAGES, SITE_IMAGE_ALT_MAX, getSiteImages, isSiteImageKey, siteImageKeys } from "@/lib/site-images";
import { FaqEditor, TextFieldEditor, ToggleFieldEditor } from "./field-editors";
import { PhotoEditor } from "./photo-editor";

export const metadata = { title: "Website wording" };
export const dynamic = "force-dynamic";

function when(at: Date): string {
  return `${sydneyDateMedium(at)}, ${sydneyTimeShort(at)}`;
}

export default async function WebsitePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/website");
  if (session.user.role !== "ADMIN") redirect("/staff");

  const [content, rows, images, imageRows, recent] = await Promise.all([
    getSiteContent(),
    db.siteContent.findMany({ select: { key: true, updatedAt: true, updatedBy: true } }),
    getSiteImages(),
    db.siteImage.findMany({ select: { key: true, updatedAt: true, updatedBy: true } }),
    db.auditLog.findMany({
      where: { action: { in: ["UPDATE_SITE_CONTENT", "RESET_SITE_CONTENT", "UPDATE_SITE_IMAGE", "RESET_SITE_IMAGE"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, resource: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const imageRowByKey = new Map(imageRows.map((r) => [r.key, r]));
  const keys = Object.keys(SITE_CONTENT) as SiteContentKey[];

  function editor(key: SiteContentKey) {
    const def = SITE_CONTENT[key];
    const row = rowByKey.get(key);
    const common = {
      fieldKey: key,
      label: def.label,
      help: def.help,
      isCustom: !!row,
      lastChanged: row ? `Last changed by ${row.updatedBy ?? "an admin"} on ${when(row.updatedAt)}` : null,
    };
    const value = content[key];
    if (def.kind === "faq") {
      return (
        <FaqEditor
          {...common}
          value={value as typeof content.faqs}
          maxItems={FAQ_MAX_ITEMS}
          questionMax={FAQ_QUESTION_MAX}
          answerMax={def.maxLength}
        />
      );
    }
    if (def.kind === "toggle") return <ToggleFieldEditor {...common} value={value as boolean} />;
    return (
      <TextFieldEditor {...common} value={value as string} multiline={def.kind === "longtext"} maxLength={def.maxLength} />
    );
  }

  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">Website</span>}>
      <div className="p-4 space-y-6 max-w-3xl">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">Website wording and photos</h1>
          <p className="text-sm text-muted-foreground">
            Change the words on the public website. Saved changes go live within a few seconds. Plain text only; press
            Enter for a new line. &ldquo;Back to original&rdquo; puts the built-in wording back. Prices and treatments
            are changed on the Services page.
          </p>
        </header>

        {SITE_CONTENT_GROUPS.map((group) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {keys
                .filter((k) => SITE_CONTENT[k].group === group)
                .map((k) => (
                  <div key={k} className="border-t pt-4 first:border-t-0 first:pt-0">
                    {editor(k)}
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Photos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pick a photo from your computer or phone. It is shrunk and saved as a JPEG automatically. Only use photos
              you own or are licensed to use, and never photos of clients without their written permission.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {siteImageKeys().map((k) => {
              const def = SITE_IMAGES[k];
              const row = imageRowByKey.get(k);
              return (
                <div key={k} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <PhotoEditor
                    slotKey={k}
                    label={def.label}
                    help={def.help}
                    sizeHint={def.sizeHint}
                    src={images[k].src}
                    alt={images[k].alt}
                    defaultAlt={def.defaultAlt}
                    isCustom={images[k].isCustom}
                    lastChanged={row ? `Last changed by ${row.updatedBy ?? "an admin"} on ${when(row.updatedAt)}` : null}
                    altMax={SITE_IMAGE_ALT_MAX}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent changes</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {recent.map((r) => {
                  const key = r.resource?.replace(/^Site(Content|Image):/, "") ?? "";
                  const fieldLabel = isSiteContentKey(key)
                    ? `${SITE_CONTENT[key].group}: ${SITE_CONTENT[key].label}`
                    : isSiteImageKey(key)
                      ? `Photos: ${SITE_IMAGES[key].label}`
                      : key;
                  const verb = r.action.startsWith("RESET_") ? "put back to original" : "changed";
                  return (
                    <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-medium">{fieldLabel}</span> {verb}
                      </span>
                      <span className="text-muted-foreground">
                        {r.user?.name ?? "Unknown"} · {when(r.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
