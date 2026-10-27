/**
 * Generates an authentic sample PDF buffer with tabular structure,
 * numbers, leading zeros, and total row to allow immediate 1-click pipeline testing.
 */
export function createSamplePdfBuffer(): ArrayBuffer {
  // A clean, valid PDF-1.4 document containing an invoice table with text streams and vector grid lines.
  const contentStream = `
BT
/F1 18 Tf
50 780 Td
(OFUQ EXTRACTION - SAMPLE TAX INVOICE) Tj
/F1 12 Tf
0 -25 Td
(Invoice Number: INV-2026-0894) Tj
0 -18 Td
(Date: 2026-10-03) Tj
0 -18 Td
(Customer Phone: 0501234567) Tj
0 -18 Td
(Tax ID: 300123456700003) Tj
ET

% Draw Table Headers Background
0.9 0.92 0.95 rg
50 635 495 25 re
f

% Draw Table Borders
0.2 0.2 0.2 RG
1 w
50 500 495 160 re
S
50 635 m 545 635 l S
50 600 m 545 600 l S
50 565 m 545 565 l S
50 530 m 545 530 l S

% Column separators
180 500 m 180 660 l S
280 500 m 280 660 l S
380 500 m 380 660 l S
460 500 m 460 660 l S

% Table Header Text
BT
/F1 11 Tf
0 0 0 rg
60 642 Td
(Description / Item) Tj
135 0 Td
(Quantity) Tj
105 0 Td
(Unit Price) Tj
105 0 Td
(VAT 15%) Tj
85 0 Td
(Total SAR) Tj
ET

% Row 1: Cloud Server Subscription
BT
/F1 10 Tf
60 610 Td
(Cloud Server Subscription) Tj
140 0 Td
(2) Tj
105 0 Td
(1500.00) Tj
105 0 Td
(450.00) Tj
80 0 Td
(3450.00) Tj
ET

% Row 2: Database Storage
BT
/F1 10 Tf
60 575 Td
(Database Storage 500GB) Tj
140 0 Td
(1) Tj
105 0 Td
(800.00) Tj
105 0 Td
(120.00) Tj
80 0 Td
(920.00) Tj
ET

% Row 3: Security & Backup License
BT
/F1 10 Tf
60 540 Td
(Security & Backup License) Tj
140 0 Td
(1) Tj
105 0 Td
(500.00) Tj
105 0 Td
(75.00) Tj
85 0 Td
(575.00) Tj
ET

% Row 4: Total Row
0.95 0.95 0.95 rg
50 500 495 30 re
f
0.2 0.2 0.2 RG
50 530 m 545 530 l S

BT
/F1 11 Tf
0 0 0 rg
60 510 Td
(Total / Total Amount) Tj
405 0 Td
(4945.00) Tj
ET
`;

  const streamBytes = new TextEncoder().encode(contentStream.trim());
  const streamLength = streamBytes.length;

  const pdfParts = [
    `%PDF-1.4\n`,
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n`,
  ];

  const part1 = new TextEncoder().encode(pdfParts.join(''));
  const part3 = new TextEncoder().encode(`\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000248 00000 n \n0000000${(350 + streamLength).toString().padStart(4, '0')} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${450 + streamLength}\n%%EOF\n`);

  const combined = new Uint8Array(part1.length + streamBytes.length + part3.length);
  combined.set(part1, 0);
  combined.set(streamBytes, part1.length);
  combined.set(part3, part1.length + streamBytes.length);

  return combined.buffer;
}
