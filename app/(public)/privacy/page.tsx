import { CLINIC } from "@/lib/clinic";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <div className="container py-12 md:py-16 max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight mb-2">Privacy policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Effective May 2026. Updated October 2026. Reviewed annually.
      </p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold">1. About this policy</h2>
          <p className="text-muted-foreground">
            {CLINIC.name} (&quot;we&quot;, &quot;us&quot;) is bound by the
            Privacy Act 1988 (Cth) and the Australian Privacy Principles
            (APPs). This policy explains how we collect, use, store and
            disclose your personal and health information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">
            2. What we collect (APP 3)
          </h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>Identity: name, email, phone, date of birth (if provided).</li>
            <li>
              Health information: medical conditions, medications, allergies,
              injuries, pregnancy status, and treatment notes — collected only
              with your explicit consent and only where reasonably necessary
              for treatment.
            </li>
            <li>Booking history and treatment records.</li>
            <li>
              Phone calls: if our automated phone assistant answers your call,
              a written record of the conversation (what you said and what the
              assistant replied). We do not record the audio of the call.
            </li>
            <li>
              Technical data: IP address and device information, used for
              security and audit logging.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. How we use it (APP 6)</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1">
            <li>To provide and manage your treatment.</li>
            <li>To contact you about appointments, reminders, and follow-up.</li>
            <li>To meet our legal and professional record-keeping obligations.</li>
            <li>
              We do <strong>not</strong> use your health information for
              marketing.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. Storage &amp; security (APP 11)</h2>
          <p className="text-muted-foreground">
            Records are stored on Australian-based infrastructure (Sydney) with
            encryption at rest at the storage layer. Access is restricted to
            authorised staff by individual login and role, and every access to a
            health record is audit-logged. We retain treatment records for at
            least seven (7) years from the date of last service, in line with
            healthcare record-keeping standards in NSW.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. Disclosure (APP 6, 8)</h2>
          <p className="text-muted-foreground">
            We do not share your treatment records with third parties
            (including health funds, GPs, or insurers) except with your
            written consent or where required by law.
          </p>
          <p className="text-muted-foreground mt-2">
            <strong>Cross-border disclosure of limited contact data.</strong>{" "}
            To deliver booking-confirmation emails and SMS reminders we use
            third-party processors who may handle your name, email, mobile
            number and booking reference outside Australia: <em>Resend</em>{" "}
            (United States) for email and <em>Twilio</em> (United States) for
            SMS. These processors do <strong>not</strong> receive your health
            information. Your clinical and intake records are stored
            exclusively on Australian-based infrastructure (see Section 4).
          </p>
          <p className="text-muted-foreground mt-2">
            <strong>Automated phone assistant.</strong> When our team is busy
            with clients, your call may be answered by an automated assistant
            that can answer questions, book appointments and take messages. It
            tells you it is automated at the start of the call. It asks only
            for your name, phone number and the appointment you want. It never
            asks about your health or for payment details. Your call is handled
            by <em>Twilio</em> (a United States company) in its Sydney,
            Australia region, and Twilio also turns your speech into text.
            Some of Twilio&apos;s processing may still take place outside
            Australia. The assistant&apos;s replies are generated by an AI
            service (<em>Anthropic</em>, through <em>Vercel</em>) that runs in
            an Australian data centre and does not keep a copy of the
            conversation. We store the written record of the call, encrypted,
            on our Australian-based systems. Please don&apos;t share health
            details over the phone; you can give them on your health form at
            the clinic. If you&apos;d rather not speak with the assistant, you
            can book online, email us, or call back to speak with a person.
          </p>
        </section>

        <section id="data-request">
          <h2 className="text-xl font-semibold">
            6. Your rights — access, correction, deletion (APP 12, 13)
          </h2>
          <p className="text-muted-foreground">
            You can request to access or correct your records at any time
            from your client portal, or by emailing{" "}
            <a className="underline" href={`mailto:${CLINIC.privacyOfficerEmail}`}>
              {CLINIC.privacyOfficerEmail}
            </a>
            . We respond within 30 days. You may also request deletion subject
            to legal record-retention obligations.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. Notifiable data breaches</h2>
          <p className="text-muted-foreground">
            If a data breach is likely to result in serious harm, we will
            notify you and the Office of the Australian Information
            Commissioner (OAIC) as required under the Notifiable Data Breaches
            scheme.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. Complaints</h2>
          <p className="text-muted-foreground">
            Privacy complaints can be made to {CLINIC.privacyOfficerEmail}. If
            unresolved, you may escalate to the OAIC at oaic.gov.au.
          </p>
        </section>
      </div>
    </div>
  );
}
