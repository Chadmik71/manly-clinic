// Smallest possible PDF render via @react-pdf/renderer
import * as ReactPdf from "@react-pdf/renderer";
import React from "react";

const { Document, Page, Text, pdf } = ReactPdf;
const e = React.createElement;

const doc = e(
  Document,
  null,
  e(Page, null, e(Text, null, "Hello, world.")),
);

console.log("Calling pdf()...");
const result = await pdf(doc).toBuffer();
const chunks = [];
result.on("data", (c) => chunks.push(Buffer.from(c)));
result.on("end", () => {
  const buf = Buffer.concat(chunks);
  console.log("Bytes:", buf.length, "Header:", buf.slice(0, 4).toString());
});
result.on("error", (e) => console.error("STREAM ERR", e));
