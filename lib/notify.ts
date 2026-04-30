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
  // Replace the default ", " separator before time with " at " for natural English.
  // SYD_LONG produces "Thursday, 30 April 2026, 11:00 am" by default.
  const parts = SYD_LONG.formatToParts(d);
  const date = parts
    .filter((p) => ["weekday", "day", "month", "year"].includes(p.type))
    .map((p) => p.value)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const time = parts
    .filter((p) => ["hour", "minute", "dayPeriod"].includes(p.type))
    .map((p) => p.value)
    .join("")
    .replace(/\s+/g, "")
    .trim();
  return `${date} at ${time}`;
}

function fmtShort(d: Date): string {
  // SMS-friendly compact: "Thu 30 Apr 11:00am"
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
}): Promise<void> {
  const subject = `Booking confirmed — ${args.reference}`;
  const text = `Hi ${args.name},

Your ${args.serviceName} (${args.durationMin} min) is confirmed for ${fmt(args.startsAt)}.

Booking reference: ${args.reference}
Manage / cancel / reschedule: ${CLINIC.domain}/portal/bookings

${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb}
${CLINIC.phone}`;
  const html = `<p>Hi ${args.name},</p>
<p>Your <strong>${args.serviceName}</strong> (${args.durationMin} min) is confirmed for <strong>${fmt(args.startsAt)}</strong>.</p>
<p>Booking reference: <code>${args.reference}</code><br/>
<a href="${CLINIC.domain}/portal/bookings">Manage your booking</a></p>
<p style="color:#64748b;font-size:12px">${CLINIC.name} · ${CLINIC.address.line1}, ${CLINIC.address.suburb} · ${CLINIC.phone}</p>`;
  await sendEmail({ to: args.email, subject, html, text });
  if (args.phone) {
    await sendSms({
      to: args.phone,
      body: `${CLINIC.name}: ${args.serviceName} ${args.durationMin}min confirmed ${fmtShort(args.startsAt)}. Ref ${args.reference}.`,
    });
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
      ? `\nA late-cancellation fee of $${(args.feeCents / 100).toFixed(2)} applies (within 24h of start).\n`
      : "";
  const text = `Hi ${args.name},

Your booking (${args.reference}) for ${fmt(args.startsAt)} has been cancelled.${feeLine}
We hope to see you again soon.

${CLINIC.name}`;
  const html = `<p>Hi ${args.name},</p><p>Your booking <code>${args.reference}</code> for ${fmt(args.startsAt)} has been cancelled.</p>${args.feeCents > 0 ? `<p>A late-cancellation fee of $${(args.feeCents / 100).toFixed(2)} applies (within 24h of start).</p>` : ""}<p>${CLINIC.name}</p>`;
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
