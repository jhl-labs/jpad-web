import { strFromU8, unzipSync } from "fflate";

export type UploadDlpScanMode = "off" | "best_effort" | "required";

export interface UploadDlpFinding {
  code: string;
  category: "dlp" | "scanner";
  severity: "info" | "warning" | "high";
  message: string;
}

interface UploadDlpConfig {
  scanMode: UploadDlpScanMode;
  detectors: string[];
  maxExtractedCharacters: number;
}

interface ExtractionResult {
  supported: boolean;
  succeeded: boolean;
  method: string | null;
  text: string;
  truncated: boolean;
}

export interface UploadDlpResult {
  allowed: boolean;
  status: "clean" | "blocked" | "bypassed" | "error";
  scanner: string | null;
  findings: UploadDlpFinding[];
}

const DEFAULT_DETECTORS = [
  "credit_card",
  "us_ssn",
  "korean_rrn",
  "aws_access_key",
  "private_key",
] as const;

type DetectorName = (typeof DEFAULT_DETECTORS)[number];

function parseIntegerEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getUploadDlpConfig(): UploadDlpConfig {
  const rawMode = (process.env.UPLOAD_DLP_SCAN_MODE || "off").trim().toLowerCase();
  const scanMode: UploadDlpScanMode =
    rawMode === "required" || rawMode === "best_effort" || rawMode === "off"
      ? rawMode
      : "off";

  const requestedDetectors = (
    process.env.UPLOAD_DLP_DETECTORS || DEFAULT_DETECTORS.join(",")
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value): value is DetectorName =>
      DEFAULT_DETECTORS.includes(value as DetectorName)
    );

  return {
    scanMode,
    detectors: requestedDetectors,
    maxExtractedCharacters: parseIntegerEnv(
      process.env.UPLOAD_DLP_MAX_EXTRACTED_CHARACTERS,
      50_000,
      1_000,
      500_000
    ),
  };
}

function decodeXmlEntities(value: string) {
  // &amp; must be decoded last to avoid double-unescaping (e.g. &amp;lt; → &lt; → <)
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizeText(value: string, maxCharacters: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxCharacters
    ? {
        text: normalized.slice(0, maxCharacters),
        truncated: true,
      }
    : {
        text: normalized,
        truncated: false,
      };
}

function decodePdfLiteralString(value: string) {
  return value
    .replace(/\\([\\()])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function extractPdfText(buffer: Buffer, maxCharacters: number): ExtractionResult {
  const source = buffer.toString("latin1");
  const matches = source.match(/\((?:\\.|[^\\)])+\)/g) || [];
  const fragments = matches
    .map((match) => decodePdfLiteralString(match.slice(1, -1)))
    .filter((fragment) => /[A-Za-z0-9]/.test(fragment));

  const normalized = normalizeText(
    fragments.length > 0 ? fragments.join(" ") : source.replace(/[^\x20-\x7E]+/g, " "),
    maxCharacters
  );

  return {
    supported: true,
    succeeded: true,
    method: "pdf-text",
    text: normalized.text,
    truncated: normalized.truncated,
  };
}

function extractDocxText(buffer: Buffer, maxCharacters: number): ExtractionResult {
  const archive = unzipSync(new Uint8Array(buffer));
  const fragments: string[] = [];

  for (const [path, content] of Object.entries(archive)) {
    if (!path.startsWith("word/") || !path.endsWith(".xml")) {
      continue;
    }

    const xml = strFromU8(content);
    const textNodes = Array.from(xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g));
    if (textNodes.length > 0) {
      fragments.push(...textNodes.map((match) => decodeXmlEntities(match[1] || "")));
    }
  }

  const normalized = normalizeText(fragments.join(" "), maxCharacters);
  return {
    supported: true,
    succeeded: true,
    method: "docx-xml",
    text: normalized.text,
    truncated: normalized.truncated,
  };
}

function extractXlsxText(buffer: Buffer, maxCharacters: number): ExtractionResult {
  const archive = unzipSync(new Uint8Array(buffer));
  const fragments: string[] = [];

  for (const [path, content] of Object.entries(archive)) {
    if (!path.startsWith("xl/") || !path.endsWith(".xml")) {
      continue;
    }

    const xml = strFromU8(content);
    const textNodes = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g));
    if (textNodes.length > 0) {
      fragments.push(...textNodes.map((match) => decodeXmlEntities(match[1] || "")));
    }
  }

  const normalized = normalizeText(fragments.join(" "), maxCharacters);
  return {
    supported: true,
    succeeded: true,
    method: "xlsx-xml",
    text: normalized.text,
    truncated: normalized.truncated,
  };
}

function extractXmlLikeText(buffer: Buffer, maxCharacters: number): ExtractionResult {
  const xml = buffer.toString("utf8");
  const normalized = normalizeText(
    decodeXmlEntities(xml.replace(/<[^>]+>/g, " ")),
    maxCharacters
  );

  return {
    supported: true,
    succeeded: true,
    method: "xml-text",
    text: normalized.text,
    truncated: normalized.truncated,
  };
}

function extractTextForDlp(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  maxCharacters: number
): ExtractionResult {
  const lowerFilename = filename.trim().toLowerCase();

  try {
    if (mimeType === "application/pdf" || lowerFilename.endsWith(".pdf")) {
      return extractPdfText(buffer, maxCharacters);
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerFilename.endsWith(".docx")
    ) {
      return extractDocxText(buffer, maxCharacters);
    }

    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      lowerFilename.endsWith(".xlsx")
    ) {
      return extractXlsxText(buffer, maxCharacters);
    }

    if (mimeType === "image/svg+xml" || lowerFilename.endsWith(".svg")) {
      return extractXmlLikeText(buffer, maxCharacters);
    }
  } catch (error) {
    return {
      supported: true,
      succeeded: false,
      method: null,
      text: "",
      truncated: false,
    };
  }

  return {
    supported: false,
    succeeded: false,
    method: null,
    text: "",
    truncated: false,
  };
}

function maskPreview(value: string) {
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function runLuhnCheck(value: string) {
  let sum = 0;
  let shouldDouble = false;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number.parseInt(value[i], 10);
    if (Number.isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function firstCreditCardMatch(text: string) {
  const matches = text.match(/\b(?:\d[ -]*?){13,19}\b/g) || [];
  return matches.find((match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && runLuhnCheck(digits);
  });
}

function firstRegexMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[0] || null;
}

function runDetectors(text: string, detectors: string[]): UploadDlpFinding[] {
  const findings: UploadDlpFinding[] = [];

  if (detectors.includes("credit_card")) {
    const match = firstCreditCardMatch(text);
    if (match) {
      findings.push({
        code: "dlp_credit_card",
        category: "dlp",
        severity: "high",
        message: `Potential credit card number detected (${maskPreview(
          match.replace(/\s+/g, "")
        )}).`,
      });
    }
  }

  if (detectors.includes("us_ssn")) {
    const match = firstRegexMatch(
      text,
      /\b(?!000|666|9\d\d)\d{3}-?(?!00)\d{2}-?(?!0000)\d{4}\b/
    );
    if (match) {
      findings.push({
        code: "dlp_us_ssn",
        category: "dlp",
        severity: "high",
        message: `Potential US SSN detected (${maskPreview(match)}).`,
      });
    }
  }

  if (detectors.includes("korean_rrn")) {
    const match = firstRegexMatch(text, /\b\d{6}-?[1-4]\d{6}\b/);
    if (match) {
      findings.push({
        code: "dlp_korean_rrn",
        category: "dlp",
        severity: "high",
        message: `Potential Korean resident registration number detected (${maskPreview(
          match
        )}).`,
      });
    }
  }

  if (detectors.includes("aws_access_key")) {
    const match = firstRegexMatch(text, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/);
    if (match) {
      findings.push({
        code: "dlp_aws_access_key",
        category: "dlp",
        severity: "high",
        message: `Potential AWS access key detected (${maskPreview(match)}).`,
      });
    }
  }

  if (detectors.includes("private_key")) {
    const match = firstRegexMatch(
      text,
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/
    );
    if (match) {
      findings.push({
        code: "dlp_private_key",
        category: "dlp",
        severity: "high",
        message: "Potential private key material detected.",
      });
    }
  }

  return findings;
}

export interface UploadDlpOverrides {
  scanMode?: UploadDlpScanMode | null;
  detectors?: string[] | null;
  maxExtractedCharacters?: number | null;
}

export async function evaluateUploadDlp(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  overrides?: UploadDlpOverrides
): Promise<UploadDlpResult> {
  const envConfig = getUploadDlpConfig();
  const config: UploadDlpConfig = {
    scanMode: overrides?.scanMode ?? envConfig.scanMode,
    detectors:
      overrides?.detectors && overrides.detectors.length > 0
        ? overrides.detectors
        : envConfig.detectors,
    maxExtractedCharacters:
      overrides?.maxExtractedCharacters ?? envConfig.maxExtractedCharacters,
  };

  if (config.scanMode === "off") {
    return {
      allowed: true,
      status: "bypassed",
      scanner: null,
      findings: [],
    };
  }

  const extraction = extractTextForDlp(
    filename,
    mimeType,
    buffer,
    config.maxExtractedCharacters
  );

  if (!extraction.supported) {
    return {
      allowed: true,
      status: "bypassed",
      scanner: null,
      findings: [],
    };
  }

  if (!extraction.succeeded) {
    const finding: UploadDlpFinding = {
      code: "dlp_extraction_failed",
      category: "scanner",
      severity: config.scanMode === "required" ? "high" : "warning",
      message: "Document content extraction failed during DLP scan.",
    };

    return {
      allowed: config.scanMode !== "required",
      status: "error",
      scanner: "dlp",
      findings: [finding],
    };
  }

  const findings = runDetectors(extraction.text, config.detectors);
  if (findings.length > 0) {
    return {
      allowed: false,
      status: "blocked",
      scanner: `dlp:${extraction.method || "text"}`,
      findings,
    };
  }

  return {
    allowed: true,
    status: "clean",
    scanner: `dlp:${extraction.method || "text"}`,
    findings: extraction.truncated
      ? [
          {
            code: "dlp_text_truncated",
            category: "scanner",
            severity: "info",
            message: "Document text was truncated to the configured DLP inspection limit.",
          },
        ]
      : [],
  };
}

export function getUploadDlpRuntimeStatus() {
  const config = getUploadDlpConfig();
  return {
    dlpScanMode: config.scanMode,
    dlpDetectors: config.detectors,
    dlpMaxExtractedCharacters: config.maxExtractedCharacters,
    dlpCanInspectPdf: true,
    dlpCanInspectDocx: true,
    dlpCanInspectXlsx: true,
    dlpCanInspectSvg: true,
  };
}
