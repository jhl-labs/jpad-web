import { evaluateUploadSecurity } from "../../src/lib/uploadSecurity";

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function main() {
  const previous = {
    mode: process.env.UPLOAD_MALWARE_SCAN_MODE,
    host: process.env.UPLOAD_CLAMAV_HOST,
    dlpMode: process.env.UPLOAD_DLP_SCAN_MODE,
    allowSvg: process.env.UPLOAD_ALLOW_SVG,
    filenamePolicy: process.env.UPLOAD_ENFORCE_FILENAME_POLICY,
  };

  try {
    setEnv("UPLOAD_ALLOW_SVG", "0");
    setEnv("UPLOAD_ENFORCE_FILENAME_POLICY", "1");
    setEnv("UPLOAD_DLP_SCAN_MODE", "off");
    setEnv("UPLOAD_MALWARE_SCAN_MODE", "best_effort");
    setEnv("UPLOAD_CLAMAV_HOST", undefined);

    const svgBlocked = await evaluateUploadSecurity(
      "diagram.svg",
      "image/svg+xml",
      Buffer.from("<svg></svg>", "utf8")
    );
    if (svgBlocked.allowed || svgBlocked.status !== "blocked") {
      throw new Error("expected SVG upload to be blocked by policy");
    }

    setEnv("UPLOAD_MALWARE_SCAN_MODE", "required");
    const eicarBlocked = await evaluateUploadSecurity(
      "report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Buffer.from(
        "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
        "latin1"
      )
    );
    if (eicarBlocked.allowed || eicarBlocked.status !== "blocked") {
      throw new Error("expected EICAR signature to be blocked");
    }

    setEnv("UPLOAD_MALWARE_SCAN_MODE", "best_effort");
    const scannerWarning = await evaluateUploadSecurity(
      "safe.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4\n", "utf8")
    );
    if (!scannerWarning.allowed || scannerWarning.status !== "error") {
      throw new Error("expected best_effort mode without scanner to allow upload with warning");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          svgBlockedStatus: svgBlocked.status,
          eicarBlockedStatus: eicarBlocked.status,
          scannerWarningStatus: scannerWarning.status,
        },
        null,
        2
      )
    );
  } finally {
    setEnv("UPLOAD_MALWARE_SCAN_MODE", previous.mode);
    setEnv("UPLOAD_CLAMAV_HOST", previous.host);
    setEnv("UPLOAD_DLP_SCAN_MODE", previous.dlpMode);
    setEnv("UPLOAD_ALLOW_SVG", previous.allowSvg);
    setEnv("UPLOAD_ENFORCE_FILENAME_POLICY", previous.filenamePolicy);
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
