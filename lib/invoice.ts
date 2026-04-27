import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { CLINIC } from "@/lib/clinic";

export type InvoiceData = {
  reference: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  paidCents: number;
  cancellationFeeCents: number;
  client: { name: string; email: string; phone: string | null };
  therapist: {
    name: string;
    providerNumber: string | null;
    associationName: string | null;
  } | null;
  healthFund: {
    name: string;
    memberNumber: string;
    reasonForTreatment: string;
  } | null;
};

const COLORS = {
  text: "#0f172a",
  muted: "#64748b",
  brand: "#0d8281",
  border: "#e2e8f0",
};

function aud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: `Tax Invoice ${data.reference}` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const M = 48;
    const innerW = W - M * 2;

    // --- Header ---
    doc
      .fillColor(COLORS.brand)
      .fontSize(18)
      .font("Helvetica-Bold")
      .text(CLINIC.name, M, M, { width: innerW / 2 });
    doc
      .fillColor(COLORS.muted)
      .fontSize(9)
      .font("Helvetica")
      .text(CLINIC.legalName, M, doc.y + 2, { width: innerW / 2 })
      .text(
        `${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}`,
        { width: innerW / 2 },
      )
      .text(`${CLINIC.phone} · ${CLINIC.email}`, { width: innerW / 2 })
      .text(`ABN ${CLINIC.abn}`, { width: innerW / 2 });

    const headerEndY = doc.y;

    // Right side header
    doc
      .fillColor(COLORS.text)
      .font("Helvetica-Bold")
      .fontSize(22)
      .text("Tax invoice", M + innerW / 2, M, {
        width: innerW / 2,
        align: "right",
      });
    doc
      .fillColor(COLORS.muted)
      .fontSize(9)
      .font("Helvetica")
      .text(`Reference ${data.reference}`, {
        width: innerW / 2,
        align: "right",
      })
      .text(`Issued ${format(new Date(), "d MMM yyyy")}`, {
        width: innerW / 2,
        align: "right",
      })
      .text(`Status ${data.status}`, { width: innerW / 2, align: "right" });

    let y = Math.max(headerEndY, doc.y) + 18;

    // helper for sections
    const section = (label: string, lines: (string | null)[]) => {
      doc
        .fillColor(COLORS.muted)
        .fontSize(8)
        .font("Helvetica-Bold")
        .text(label.toUpperCase(), M, y, { characterSpacing: 1 });
      y = doc.y + 2;
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);
      for (const line of lines.filter(Boolean) as string[]) {
        doc.text(line, M, y, { width: innerW });
        y = doc.y;
      }
      y += 10;
    };

    section("Client", [
      data.client.name,
      data.client.email,
      data.client.phone,
    ]);

    if (data.therapist) {
      const meta =
        data.therapist.associationName || data.therapist.providerNumber
          ? `${data.therapist.associationName ? data.therapist.associationName + " · " : ""}${data.therapist.providerNumber ? "Provider " + data.therapist.providerNumber : ""}`
          : null;
      section("Therapist", [data.therapist.name, meta]);
    }

    if (data.healthFund) {
      section("Health fund", [
        `${data.healthFund.name} · Member ${data.healthFund.memberNumber}`,
        `Reason: ${data.healthFund.reasonForTreatment}`,
      ]);
    }

    // --- Line items table ---
    y += 4;
    doc
      .moveTo(M, y)
      .lineTo(M + innerW, y)
      .strokeColor(COLORS.border)
      .lineWidth(1)
      .stroke();
    y += 8;

    const c1 = M;
    const c2 = M + innerW - 80;
    const colW = 80;

    doc
      .fillColor(COLORS.muted)
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("DESCRIPTION", c1, y, { characterSpacing: 1 })
      .text("AMOUNT", c2, y, { width: colW, align: "right", characterSpacing: 1 });
    y += 14;
    doc
      .moveTo(M, y)
      .lineTo(M + innerW, y)
      .strokeColor(COLORS.border)
      .stroke();
    y += 10;

    // Session row
    doc
      .fillColor(COLORS.text)
      .fontSize(10)
      .font("Helvetica")
      .text(`${data.serviceName} (${data.durationMin} min)`, c1, y, {
        width: c2 - c1 - 10,
      });
    const rowY1 = doc.y;
    doc
      .fillColor(COLORS.muted)
      .fontSize(9)
      .text(
        `${format(data.startsAt, "EEEE d MMMM yyyy, h:mm a")} – ${format(data.endsAt, "h:mm a")}`,
        c1,
        rowY1,
        { width: c2 - c1 - 10 },
      );
    doc
      .fillColor(COLORS.text)
      .fontSize(10)
      .text(aud(data.priceCents), c2, y, { width: colW, align: "right" });
    y = doc.y + 12;
    doc
      .moveTo(M, y - 4)
      .lineTo(M + innerW, y - 4)
      .strokeColor(COLORS.border)
      .stroke();

    if (data.cancellationFeeCents > 0) {
      doc
        .fillColor(COLORS.text)
        .fontSize(10)
        .text("Cancellation fee (within 24h)", c1, y, {
          width: c2 - c1 - 10,
        });
      doc.text(aud(data.cancellationFeeCents), c2, y, {
        width: colW,
        align: "right",
      });
      y = doc.y + 10;
      doc
        .moveTo(M, y - 4)
        .lineTo(M + innerW, y - 4)
        .strokeColor(COLORS.border)
        .stroke();
    }

    // --- Totals ---
    const total =
      data.priceCents + Math.max(0, data.cancellationFeeCents);
    const balance = total - data.paidCents;

    y += 8;
    const totalLabelX = M + innerW - 200;
    const totalValueX = M + innerW - 80;
    const writeTotal = (label: string, value: string, bold = false) => {
      doc
        .fillColor(COLORS.muted)
        .fontSize(10)
        .font("Helvetica")
        .text(label, totalLabelX, y, { width: 120, align: "right" });
      doc
        .fillColor(COLORS.text)
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .text(value, totalValueX, y, { width: 80, align: "right" });
      y += 16;
    };
    writeTotal("Total", aud(total), true);
    writeTotal("Paid", aud(data.paidCents));
    writeTotal("Balance", aud(balance), true);

    // --- Footer ---
    y += 20;
    doc
      .moveTo(M, y)
      .lineTo(M + innerW, y)
      .strokeColor(COLORS.border)
      .stroke();
    y += 8;
    doc
      .fillColor(COLORS.muted)
      .fontSize(8)
      .font("Helvetica")
      .text(
        "This receipt is a tax invoice for the service supplied. GST is not applicable to therapeutic massage services where the practitioner is a recognised professional under GST legislation.",
        M,
        y,
        { width: innerW },
      );
    doc.text(
      "Health fund rebates are subject to your individual fund and policy. Keep this receipt for your records.",
      M,
      doc.y + 4,
      { width: innerW },
    );

    doc.end();
  });
}
