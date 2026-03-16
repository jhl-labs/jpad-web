import { evaluateUploadSecurity } from "../../src/lib/uploadSecurity";

const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function main() {
  const clean = await evaluateUploadSecurity(
    "safe.pdf",
    "application/pdf",
    Buffer.from("%PDF-1.4\n", "utf8")
  );
  if (!clean.allowed || clean.status !== "clean" || clean.scanner !== "clamav") {
    throw new Error(`expected clean clamav result, got ${JSON.stringify(clean)}`);
  }

  const infected = await evaluateUploadSecurity(
    "report.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    Buffer.from(EICAR_SIGNATURE, "latin1")
  );
  if (infected.allowed || infected.status !== "blocked" || infected.scanner !== "clamav") {
    throw new Error(`expected clamav malware detection, got ${JSON.stringify(infected)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        cleanStatus: clean.status,
        cleanScanner: clean.scanner,
        infectedStatus: infected.status,
        infectedScanner: infected.scanner,
      },
      null,
      2
    )
  );
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
