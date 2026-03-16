import { zipSync, strToU8 } from "fflate";
import { evaluateUploadSecurity } from "../../src/lib/uploadSecurity";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function createPdfWithText(text: string) {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${text.length + 32} >>
stream
BT /F1 12 Tf 72 72 Td (${text}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF`,
    "utf8"
  );
}

function createDocxWithText(text: string) {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
        </Types>`
      ),
      "_rels/.rels": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
        </Relationships>`
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0" encoding="UTF-8"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
          </w:body>
        </w:document>`
      ),
    })
  );
}

async function main() {
  const previous = {
    dlpMode: process.env.UPLOAD_DLP_SCAN_MODE,
    dlpDetectors: process.env.UPLOAD_DLP_DETECTORS,
    dlpMaxChars: process.env.UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS,
    malwareMode: process.env.UPLOAD_MALWARE_SCAN_MODE,
    clamavHost: process.env.UPLOAD_CLAMAV_HOST,
  };

  try {
    setEnv("UPLOAD_MALWARE_SCAN_MODE", "off");
    setEnv("UPLOAD_DLP_SCAN_MODE", "required");
    setEnv("UPLOAD_DLP_DETECTORS", "credit_card,aws_access_key");
    setEnv("UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS", "50000");
    setEnv("UPLOAD_CLAMAV_HOST", undefined);

    const pdfBlocked = await evaluateUploadSecurity(
      "statement.pdf",
      "application/pdf",
      createPdfWithText("Customer card 4111 1111 1111 1111")
    );
    if (pdfBlocked.allowed || pdfBlocked.status !== "blocked") {
      throw new Error("expected PDF credit card content to be blocked by DLP");
    }

    const docxBlocked = await evaluateUploadSecurity(
      "keys.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      createDocxWithText("Temporary key AKIAIOSFODNN7EXAMPLE")
    );
    if (docxBlocked.allowed || docxBlocked.status !== "blocked") {
      throw new Error("expected DOCX AWS key content to be blocked by DLP");
    }

    const unsupportedAllowed = await evaluateUploadSecurity(
      "photo.png",
      "image/png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00])
    );
    if (!unsupportedAllowed.allowed || unsupportedAllowed.status !== "bypassed") {
      throw new Error("expected unsupported image content to bypass DLP");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          pdfBlockedStatus: pdfBlocked.status,
          docxBlockedStatus: docxBlocked.status,
          unsupportedStatus: unsupportedAllowed.status,
        },
        null,
        2
      )
    );
  } finally {
    setEnv("UPLOAD_DLP_SCAN_MODE", previous.dlpMode);
    setEnv("UPLOAD_DLP_DETECTORS", previous.dlpDetectors);
    setEnv("UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS", previous.dlpMaxChars);
    setEnv("UPLOAD_MALWARE_SCAN_MODE", previous.malwareMode);
    setEnv("UPLOAD_CLAMAV_HOST", previous.clamavHost);
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
