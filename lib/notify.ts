// Notification dispatcher. Uses Resend (email) and Twilio (SMS) when their
// API keys are present in env, otherwise logs to console. Failures never
// throw — notifications are best-effort and must not block bookings.

import { CLINIC } from "@/lib/clinic";

type EmailArgs = { to: string; subject: string; html: string; text: string };
type SmsArgs = { to: string; body: string };

async function sendEmail({ to, subject, html, text }: EmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || `bookings@${CLINIC.mailDomain}`;
  if (!apiKey) {
    console.log("[notify:email:stub]", { to, subject, text });
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      console.error("[notify:email] non-ok", res.status, await res.text());
    }
  } catch (e) {
    console.error("[notify:email] error", e);
  }
}

async function sendSms({ to, body }: SmsArgs): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    console.log("[notify:sms:stub]", { to, body });
    return;
  }
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      },
    );
    if (!res.ok) {
      console.error("[notify:sms] non-ok", res.status, await res.text());
    }
  } catch (e) {
    console.error("[notify:sms] error", e);
  }
}

// Renders Sydney calendar time, regardless of server runtime TZ (Vercel = UTC).
// Long form for email subjects/bodies (e.g. "Thursday 30 April 2026 at 11:00 AM").
const SYD_LONG = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
// Short form for SMS body (e.g. "Thu 30 Apr 11:00am").
const SYD_SHORT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function fmt(d: Date): string {
  // SYD_LONG.format() produces "Thursday, 30 April 2026, 7:00 pm" in en-AU.
  // Replace the final ", " with " at " for more natural English in email subjects/bodies.
  const s = SYD_LONG.format(d);
  const lastCommaSpace = s.lastIndexOf(", ");
  return lastCommaSpace === -1 ? s : s.slice(0, lastCommaSpace) + " at " + s.slice(lastCommaSpace + 2);
}

function fmtShort(d: Date): string {
  // SMS-friendly compact: "Thu 30 Apr 7:00 pm". Strip commas only.
  return SYD_SHORT.format(d).replace(/,/g, "").replace(/\s+/g, " ").trim();
}

export async function notifyBookingConfirmed(args: {
  email: string;
  phone: string | null;
  name: string;
  reference: string;
  serviceName: string;
  durationMin: number;
  startsAt: Date;
  /** Primary booking price in cents. Optional; only used in the couple-mode email. */
  priceCents?: number;
  /**
   * Partner half details. When set, the email and SMS describe a couple
   * booking with both treatments listed. Solo callers omit this field
   * entirely and the original solo template is used unchanged.
   */
  partner?: {
    serviceName: string;
    durationMin: number;
    priceCents: number;
    /** Partner reference (typically the primary reference with a -P suffix). */
    reference: string;
    /** Partner's name (the second person), if the customer entered one. */
    partnerName?: string | null;
  };
}): Promise<void> {
  // Couple bookings get a different layout that lists both treatments and
  // both references in a single email. Solo path falls through unchanged.
  if (args.partner) {
    const p = args.partner;
    const yourPriceStr =
      args.priceCents !== undefined
        ? ` (${(args.priceCents / 100).toFixed(2)})`
        : "";
    const partnerPriceStr = ` (${(p.priceCents / 100).toFixed(2)})`;
    const partnerLabel = p.partnerName ? `for ${p.partnerName}` : "partner";

    const subjectC = `Couple booking confirmed — ${args.reference}`;
    const textC = `Hi ${args.name},

Your couple booking is confirmed for ${fmt(args.startsAt)}:

  • ${args.serviceName} — ${args.durationMin} min${yourPriceStr} (yours)
  • ${p.serviceName} — ${p.durationMin} min${partnerPriceStr} (${partnerLabel})

Booking references:
  Yours:   ${args.reference}
  Partner: ${p.reference}

Manage / cancel / reschedule: ${CLINIC.domain}/portal/bookings

${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb}
${CLINIC.phone}`;
    const htmlC = `<p>Hi ${args.name},</p>
<p>Your <strong>couple booking</strong> is confirmed for <strong>${fmt(args.startsAt)}</strong>:</p>
<ul style="margin:8px 0;padding-left:20px">
  <li><strong>${args.serviceName}</strong> — ${args.durationMin} min${yourPriceStr} <span style="color:#64748b">(yours)</span></li>
  <li><strong>${p.serviceName}</strong> — ${p.durationMin} min${partnerPriceStr} <span style="color:#64748b">(${partnerLabel})</span></li>
</ul>
<p>Booking references: <code>${args.reference}</code> (yours) &amp; <code>${p.reference}</code> (partner)<br/>
<a href="${CLINIC.domain}/portal/bookings">Manage your booking</a></p>
<p style="color:#64748b;font-size:12px">${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb} · ${CLINIC.phone}</p>`;

    await sendEmail({ to: args.email, subject: subjectC, html: htmlC, text: textC });
    if (args.phone) {
      await sendSms({
        to: args.phone,
        body: `${CLINIC.name}: couple booking ${fmtShort(args.startsAt)}. ${args.serviceName} + ${p.serviceName} (${args.durationMin}min). Refs ${args.reference} & ${p.reference}.`,
      });
    }
    return;
  }

  const subject = `Booking confirmed — ${args.reference}`;
  const text = `Hi ${args.name},

Your ${args.serviceName} (${args.durationMin} min) is confirmed for ${fmt(args.startsAt)}.

Booking reference: ${args.reference}
Manage / cancel / reschedule: ${CLINIC.domain}/portal/bookings

Cancellation policy: please give us at least 1 hour's notice if you need to cancel or reschedule. If you arrive more than 10 minutes late without calling, your booking will be treated as cancelled.

${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb}
${CLINIC.phone}`;
  const html = `<p>Hi ${args.name},</p>
<p>Your <strong>${args.serviceName}</strong> (${args.durationMin} min) is confirmed for <strong>${fmt(args.startsAt)}</strong>.</p>
<p>Booking reference: <code>${args.reference}</code><br/>
<a href="${CLINIC.domain}/portal/bookings">Manage your booking</a></p>
<p style="color:#64748b;font-size:12px;margin:12px 0;">Cancellation policy: please give us at least 1 hour&apos;s notice if you need to cancel or reschedule. If you arrive more than 10 minutes late without calling, your booking will be treated as cancelled.</p>
      <p style="color:#64748b;font-size:12px">${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb} · ${CLINIC.phone}</p>`;
  await sendEmail({ to: args.email, subject, html, text });
  if (args.phone) {
    await sendSms({
      to: args.phone,
      body: `${CLINIC.name}: ${args.serviceName} ${args.durationMin}min confirmed ${fmtShort(args.startsAt)}. Ref ${args.reference}.`,
    });
  }

  // Internal staff notification — heads-up that a booking came in.
  // Sent to STAFF_NOTIFICATION_EMAIL if set, otherwise CLINIC.email.
  // Wrapped so a failure here doesn't block the customer email/SMS that already sent.
  try {
    const staffTo =
      process.env.STAFF_NOTIFICATION_EMAIL || CLINIC.email;
    if (staffTo) {
      const isCouple = !!args.partner;
      const services = isCouple
        ? `${args.serviceName} (${args.durationMin}min) + ${args.partner!.serviceName} (${args.partner!.durationMin}min)`
        : `${args.serviceName} (${args.durationMin}min)`;
      const partnerLine = isCouple && args.partner!.partnerName
        ? `\n  Partner: ${args.partner!.partnerName}`
        : "";
      const staffSubject = `New booking: ${services} — ${fmtShort(args.startsAt)}`;
      const staffText = `A new booking has been made.\n\n  When: ${fmt(args.startsAt)}\n  Services: ${services}\n  Customer: ${args.name}${partnerLine}\n  Email: ${args.email}\n  Phone: ${args.phone || "(not provided)"}\n  Reference: ${args.reference}${isCouple ? `\n  Partner reference: ${args.partner!.reference}` : ""}\n\nManage in the staff portal: https://${CLINIC.domain}/staff/bookings\n`;
      const staffHtml = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#333;padding:16px;line-height:1.5;"><h2 style="margin:0 0 12px;">New booking</h2><p style="margin:0 0 4px;"><strong>When:</strong> ${fmt(args.startsAt)}</p><p style="margin:0 0 4px;"><strong>Services:</strong> ${services}</p><p style="margin:0 0 4px;"><strong>Customer:</strong> ${args.name}${isCouple && args.partner!.partnerName ? ` (with ${args.partner!.partnerName})` : ""}</p><p style="margin:0 0 4px;"><strong>Email:</strong> <a href="mailto:${args.email}">${args.email}</a></p><p style="margin:0 0 4px;"><strong>Phone:</strong> ${args.phone || "(not provided)"}</p><p style="margin:0 0 4px;"><strong>Reference:</strong> ${args.reference}${isCouple ? ` / ${args.partner!.reference}` : ""}</p><p style="margin:16px 0 0;"><a href="https://${CLINIC.domain}/staff/bookings">Manage in the staff portal</a></p></div>`;
      await sendEmail({ to: staffTo, subject: staffSubject, html: staffHtml, text: staffText });
    }
  } catch (err) {
    console.error("notifyBookingConfirmed: staff email failed", err);
  }
}

export async function notifyBookingCancelled(args: {
  email: string;
  phone: string | null;
  name: string;
  reference: string;
  startsAt: Date;
  feeCents: number;
}): Promise<void> {
  const subject = `Booking cancelled — ${args.reference}`;
  const feeLine =
    args.feeCents > 0
      ? `\nA late-cancellation fee of $${(args.feeCents / 100).toFixed(2)} applies (within 1h of start).\n`
      : "";
  const text = `Hi ${args.name},

Your booking (${args.reference}) for ${fmt(args.startsAt)} has been cancelled.${feeLine}
We hope to see you again soon.

${CLINIC.name}`;
  const html = `<p>Hi ${args.name},</p><p>Your booking <code>${args.reference}</code> for ${fmt(args.startsAt)} has been cancelled.</p>${args.feeCents > 0 ? `<p>A late-cancellation fee of $${(args.feeCents / 100).toFixed(2)} applies (within 1h of start).</p>` : ""}<p>${CLINIC.name}</p>`;
  await sendEmail({ to: args.email, subject, html, text });
}

export async function notifyBookingRescheduled(args: {
  email: string;
  phone: string | null;
  name: string;
  reference: string;
  oldStart: Date;
  newStart: Date;
}): Promise<void> {
  const subject = `Booking rescheduled — ${args.reference}`;
  const text = `Hi ${args.name},

Your booking (${args.reference}) has been moved.

Was: ${fmt(args.oldStart)}
Now: ${fmt(args.newStart)}

${CLINIC.name}`;
  const html = `<p>Hi ${args.name},</p><p>Your booking <code>${args.reference}</code> has been moved.</p><ul><li>Was: ${fmt(args.oldStart)}</li><li>Now: <strong>${fmt(args.newStart)}</strong></li></ul><p>${CLINIC.name}</p>`;
  await sendEmail({ to: args.email, subject, html, text });
  if (args.phone) {
    await sendSms({
      to: args.phone,
      body: `${CLINIC.name}: booking ${args.reference} moved to ${fmtShort(args.newStart)}.`,
    });
  }
}

export async function notifyBookingReminder(args: {
  email: string;
  phone: string | null;
  name: string;
  reference: string;
  serviceName: string;
  startsAt: Date;
}): Promise<void> {
  const subject = `Reminder — your ${args.serviceName} tomorrow`;
  const text = `Hi ${args.name},

Friendly reminder of your ${args.serviceName} on ${fmt(args.startsAt)}.

Booking reference: ${args.reference}
${CLINIC.address.line1}, ${CLINIC.address.suburb}

Need to change it? ${CLINIC.domain}/portal/bookings`;
  const html = `<p>Hi ${args.name},</p><p>Reminder of your <strong>${args.serviceName}</strong> on ${fmt(args.startsAt)}.</p><p>Reference <code>${args.reference}</code><br/><a href="${CLINIC.domain}/portal/bookings">Manage</a></p>`;
  await sendEmail({ to: args.email, subject, html, text });
  if (args.phone) {
    await sendSms({
      to: args.phone,
      body: `${CLINIC.name}: reminder ${args.serviceName} ${fmtShort(args.startsAt)}. Ref ${args.reference}.`,
    });
  }
}

function escapeVoucherHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function notifyVoucherIssued({
  code,
  amountCents,
  recipientName,
  recipientEmail,
  message,
  expiresAt,
}: {
  code: string;
  amountCents: number;
  recipientName: string;
  recipientEmail: string;
  message: string | null;
  expiresAt: Date | null;
}): Promise<void> {
  const value = `$${(amountCents / 100).toFixed(2)}`;
  const expiryLabel = expiresAt
    ? expiresAt.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "12 months from issue";
  const subject = `Your gift voucher from ${CLINIC.name}`;

  const safeName = escapeVoucherHtml(recipientName);
  const safeMessage = message ? escapeVoucherHtml(message) : null;
  const bookUrl = `https://${CLINIC.domain}/book`;

  const messageBlockHtml = safeMessage
    ? `<p style="margin:24px 0;padding:16px;background:#f7f5f0;border-radius:8px;font-style:italic;color:#555;">&ldquo;${safeMessage}&rdquo;</p>`
    : "";

  const html = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#333;padding:24px;">
  <h1 style="font-size:24px;margin:0 0 4px;">${CLINIC.name}</h1>
  <p style="font-size:14px;color:#888;margin:0 0 24px;">Gift voucher</p>
  <p>Hi ${safeName},</p>
  <p>You&rsquo;ve been given a gift voucher worth <strong>${value}</strong> at ${CLINIC.name}.</p>
  ${messageBlockHtml}
  <div style="margin:32px 0;padding:24px;border:2px solid #888;border-radius:8px;text-align:center;">
    <p style="margin:0 0 8px;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:1.5px;">Voucher code</p>
    <p style="margin:0;font-family:'Courier New',monospace;font-size:24px;font-weight:bold;letter-spacing:2px;word-break:break-all;">${code}</p>
    <p style="margin:20px 0 4px;font-size:11px;color:#777;text-transform:uppercase;letter-spacing:1.5px;">Value</p>
    <p style="margin:0;font-size:22px;font-weight:bold;">${value}</p>
    <p style="margin:16px 0 0;font-size:13px;color:#666;">Valid until ${expiryLabel}</p>
  </div>
  <p>To redeem: book your massage at <a href="${bookUrl}">${CLINIC.domain}/book</a> and present the code at your appointment, or call us on ${CLINIC.phone}.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;"/>
  <p style="font-size:12px;color:#888;line-height:1.5;">${CLINIC.name}<br/>${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}<br/>${CLINIC.phone}</p>
</div>
`.trim();

  const text = `${CLINIC.name} \u2014 Gift voucher

Hi ${recipientName},

You\u2019ve been given a gift voucher worth ${value} at ${CLINIC.name}.
${message ? `\n"${message}"\n` : ""}
Voucher code: ${code}
Value: ${value}
Valid until: ${expiryLabel}

To redeem: book your massage at ${bookUrl} and present the code at your appointment, or call us on ${CLINIC.phone}.

${CLINIC.name}
${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}
${CLINIC.phone}
`;

  await sendEmail({ to: recipientEmail, subject, html, text });
}
