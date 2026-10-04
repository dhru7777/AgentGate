import {
  ACCESS_RATE_USDC,
  ISSUER,
  ROBOTS_URL,
  TARIFF_URL,
  formatTimeSpent,
  formatUsdc,
  formatWhen,
  type CompanyInvoice,
} from "./build";

function esc(value: string): string {
  const ascii = value.replace(/[^\x20-\x7E]/g, "?");
  return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapWords(value: string, max: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function wrapPath(value: string, max: number): string[] {
  if (value.length <= max) return [value];
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += max) lines.push(value.slice(i, i + max));
  return lines;
}

function renderPages(invoice: CompanyInvoice): string[] {
  const pages: string[][] = [];
  let cmds: string[] = [];
  let y = 748;

  const flush = () => {
    pages.push(cmds);
    cmds = [];
    y = 748;
  };

  const ensure = (need: number) => {
    if (y - need < 52) flush();
  };

  const text = (value: string, x: number, size: number, font: "F1" | "F2", leading = size + 4) => {
    ensure(leading);
    cmds.push(`BT /${font} ${size} Tf ${x} ${y.toFixed(2)} Td (${esc(value)}) Tj ET`);
    y -= leading;
  };

  const gap = (n = 8) => {
    y -= n;
  };

  const rule = () => {
    ensure(10);
    cmds.push(`0.75 G ${48} ${y.toFixed(2)} m 564 ${y.toFixed(2)} l S 0 G`);
    y -= 12;
  };

  text("INVOICE", 48, 18, "F2", 22);
  text(invoice.id, 48, 10, "F1", 14);
  text(invoice.status === "pending" ? "PENDING" : "NOTHING DUE", 48, 10, "F2", 16);
  text(`Period: ${invoice.periodLabel}`, 48, 10, "F1");
  gap(4);
  text("From", 48, 9, "F2", 12);
  text(ISSUER.name, 48, 11, "F2", 14);
  text(`ERC-8004 #${ISSUER.agentId} on Monad testnet`, 48, 10, "F1");
  text("Verified:", 48, 9, "F1", 12);
  for (const part of wrapPath(ISSUER.verifyUrl, 88)) text(part, 48, 8, "F1", 10);
  text(`Wallet: ${ISSUER.wallet}`, 48, 8, "F1", 11);
  text(`For ${ISSUER.site}`, 48, 10, "F1");
  gap(6);
  text("To", 48, 9, "F2", 12);
  text(invoice.company, 48, 11, "F2", 14);
  text(invoice.category, 48, 10, "F1");
  gap(6);
  text("Reason", 48, 11, "F2", 14);
  for (const part of wrapWords(invoice.reason, 92)) text(part, 48, 9, "F1", 12);
  gap(4);
  text(`robots.txt  ${ROBOTS_URL}`, 48, 8, "F1", 11);
  for (const part of invoice.robotsTxt.split("\n")) text(part || " ", 48, 8, "F1", 10);
  gap(6);
  rule();
  text("Billing summary", 48, 11, "F2", 16);
  text(`Rate: ${ACCESS_RATE_USDC.toFixed(2)} USDC per page delivered (HTTP 200) while disallowed.`, 48, 9, "F1", 12);
  text(`Tariff: ${TARIFF_URL}`, 48, 8, "F1", 12);
  gap(4);

  if (invoice.lines.length === 0) {
    text("No delivered pages in this period.", 48, 10, "F1", 14);
  } else {
    text("Date and time", 48, 8, "F2", 11);
    for (const line of invoice.lines) {
      ensure(48);
      text(formatWhen(line.ts), 48, 10, "F2", 13);
      text(`${line.agent}    HTTP ${line.status}`, 48, 9, "F1", 12);
      for (const part of wrapPath(line.path, 88)) text(part, 48, 9, "F1", 12);
      text(`Time spent: ${formatTimeSpent(line.durationMs)}`, 48, 9, "F1", 12);
      text(formatUsdc(line.amountUsdc), 48, 10, "F1", 16);
    }
  }

  if (invoice.stoppedCount > 0) {
    text(
      `${invoice.stoppedCount} ${invoice.stoppedCount === 1 ? "request was" : "requests were"} stopped with HTTP 402. Not charged.`,
      48,
      9,
      "F1",
      12,
    );
  }

  gap(4);
  rule();
  text(`Amount due    ${formatUsdc(invoice.amountUsdc)}`, 48, 12, "F2", 18);

  if (cmds.length) pages.push(cmds);
  return pages.map((page) => page.join("\n"));
}

function buildPdf(streams: string[], title: string, author: string): Uint8Array {
  const bodies: string[] = [];
  const reserve = () => {
    bodies.push("");
    return bodies.length;
  };
  const catalogId = reserve();
  const pagesId = reserve();
  const fontRegular = reserve();
  const fontBold = reserve();
  const infoId = reserve();
  bodies[fontRegular - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  bodies[fontBold - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  bodies[infoId - 1] = `<< /Title (${esc(title)}) /Author (${esc(author)}) >>`;

  const pageIds: number[] = [];
  for (const stream of streams) {
    const contentId = reserve();
    bodies[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    const pageId = reserve();
    pageIds.push(pageId);
    bodies[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`;
  }
  bodies[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  bodies[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < bodies.length; i += 1) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${bodies[i]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${bodies.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer << /Size ${bodies.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(out);
}

export function invoicePdf(invoice: CompanyInvoice): Blob {
  const bytes = buildPdf(renderPages(invoice), invoice.id, ISSUER.name);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: "application/pdf" });
}
