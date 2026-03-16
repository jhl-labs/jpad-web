import net from "node:net";
import { logError } from "@/lib/logger";
import { evaluateUploadDlp, getUploadDlpRuntimeStatus, type UploadDlpOverrides } from "@/lib/uploadDlp";

const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const DEFAULT_CLAMAV_PORT = 3310;
const DEFAULT_CLAMAV_TIMEOUT_MS = 10_000;
const CLAMAV_CHUNK_SIZE = 64 * 1024;
const DEFAULT_BLOCKED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".ps1",
  ".sh",
  ".php",
  ".html",
  ".htm",
];

export type UploadMalwareScanMode = "off" | "best_effort" | "required";
export type UploadSecurityStatus =
  | "clean"
  | "blocked"
  | "bypassed"
  | "error"
  | "not_scanned";

export interface UploadSecurityFinding {
  code: string;
  category: "policy" | "malware" | "scanner" | "dlp";
  severity: "info" | "warning" | "high";
  message: string;
}

export interface UploadSecurityResult {
  allowed: boolean;
  status: UploadSecurityStatus;
  scanner: string | null;
  findings: UploadSecurityFinding[];
  checkedAt: Date | null;
}

interface UploadSecurityConfig {
  malwareScanMode: UploadMalwareScanMode;
  clamavHost: string | null;
  clamavPort: number;
  clamavTimeoutMs: number;
  enableBuiltinEicar: boolean;
  allowSvg: boolean;
  enforceFilenamePolicy: boolean;
  blockedIntermediateExtensions: string[];
}

interface SecurityScanStepResult {
  allowed: boolean;
  status: UploadSecurityStatus;
  scanner: string | null;
  findings: UploadSecurityFinding[];
}

interface ClamavScanResult {
  infected: boolean;
  signature: string | null;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean) {
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

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

function getUploadSecurityConfig(): UploadSecurityConfig {
  const scanMode = (process.env.UPLOAD_MALWARE_SCAN_MODE || "off").trim().toLowerCase();
  const malwareScanMode: UploadMalwareScanMode =
    scanMode === "required" || scanMode === "best_effort" || scanMode === "off"
      ? scanMode
      : "off";

  return {
    malwareScanMode,
    clamavHost: process.env.UPLOAD_CLAMAV_HOST?.trim() || null,
    clamavPort: parseIntegerEnv(
      process.env.UPLOAD_CLAMAV_PORT,
      DEFAULT_CLAMAV_PORT,
      1,
      65_535
    ),
    clamavTimeoutMs: parseIntegerEnv(
      process.env.UPLOAD_CLAMAV_TIMEOUT_MS,
      DEFAULT_CLAMAV_TIMEOUT_MS,
      1_000,
      120_000
    ),
    enableBuiltinEicar: parseBooleanEnv(
      process.env.UPLOAD_ENABLE_BUILTIN_EICAR,
      true
    ),
    allowSvg: parseBooleanEnv(process.env.UPLOAD_ALLOW_SVG, false),
    enforceFilenamePolicy: parseBooleanEnv(
      process.env.UPLOAD_ENFORCE_FILENAME_POLICY,
      true
    ),
    blockedIntermediateExtensions: (
      process.env.UPLOAD_BLOCKED_INTERMEDIATE_EXTENSIONS ||
      DEFAULT_BLOCKED_EXTENSIONS.join(",")
    )
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
}

function getIntermediateExtensions(filename: string) {
  const segments = filename
    .split(".")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);

  if (segments.length <= 2) {
    return [];
  }

  return segments.slice(1, -1).map((segment) => `.${segment}`);
}

function scanFilenamePolicy(
  filename: string,
  mimeType: string,
  config: UploadSecurityConfig
): UploadSecurityFinding[] {
  const findings: UploadSecurityFinding[] = [];

  if (!config.allowSvg && mimeType === "image/svg+xml") {
    findings.push({
      code: "svg_disabled",
      category: "policy",
      severity: "high",
      message: "SVG uploads are disabled by policy because they can contain active content.",
    });
  }

  if (!config.enforceFilenamePolicy) {
    return findings;
  }

  const intermediateExtensions = getIntermediateExtensions(filename);
  const blocked = intermediateExtensions.find((extension) =>
    config.blockedIntermediateExtensions.includes(extension)
  );

  if (blocked) {
    findings.push({
      code: "blocked_intermediate_extension",
      category: "policy",
      severity: "high",
      message: `Filename contains a blocked intermediate extension (${blocked}).`,
    });
  }

  return findings;
}

function scanEicar(buffer: Buffer): UploadSecurityFinding[] {
  const content = buffer.toString("latin1");
  if (!content.includes(EICAR_SIGNATURE)) {
    return [];
  }

  return [
    {
      code: "eicar_test_signature",
      category: "malware",
      severity: "high",
      message: "EICAR antivirus test signature detected.",
    },
  ];
}

function scanWithClamav(
  buffer: Buffer,
  config: UploadSecurityConfig
): Promise<ClamavScanResult> {
  return new Promise((resolve, reject) => {
    if (!config.clamavHost) {
      reject(new Error("UPLOAD_CLAMAV_HOST is not configured"));
      return;
    }

    const socket = net.createConnection({
      host: config.clamavHost,
      port: config.clamavPort,
    });

    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (error: Error | null, result?: ClamavScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      resolve(result || { infected: false, signature: null });
    };

    socket.setTimeout(config.clamavTimeoutMs, () => {
      finish(new Error("ClamAV scan timed out"));
    });

    socket.on("error", (error) => finish(error));
    socket.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const response = Buffer.concat(chunks).toString("utf8");
      if (!response.includes("\0")) {
        return;
      }

      const normalized = response.replace(/\0/g, "").trim();
      if (!normalized) {
        finish(new Error("Empty response from ClamAV"));
        return;
      }

      if (normalized.endsWith("FOUND")) {
        const signature = normalized
          .replace(/^stream:\s*/i, "")
          .replace(/\s+FOUND$/i, "");
        finish(null, { infected: true, signature });
        return;
      }

      if (/^stream:\s*ok$/i.test(normalized)) {
        finish(null, { infected: false, signature: null });
        return;
      }

      if (normalized.includes("ERROR")) {
        finish(new Error(normalized));
        return;
      }

      finish(new Error(`Unexpected ClamAV response: ${normalized}`));
    });
    socket.on("end", () => {
      if (settled) return;
      const response = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      if (!response) {
        finish(new Error("Empty response from ClamAV"));
        return;
      }

      if (response.endsWith("FOUND")) {
        const signature = response.replace(/^stream:\s*/i, "").replace(/\s+FOUND$/i, "");
        finish(null, { infected: true, signature });
        return;
      }

      if (/^stream:\s*ok$/i.test(response)) {
        finish(null, { infected: false, signature: null });
        return;
      }

      if (response.includes("ERROR")) {
        finish(new Error(response));
        return;
      }

      finish(new Error(`Unexpected ClamAV response: ${response}`));
    });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");

      for (let offset = 0; offset < buffer.length; offset += CLAMAV_CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CLAMAV_CHUNK_SIZE);
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        socket.write(size);
        socket.write(chunk);
      }

      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });
  });
}

async function runMalwareSecurityScan(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  config: UploadSecurityConfig
): Promise<SecurityScanStepResult> {
  if (config.malwareScanMode === "off") {
    return {
      allowed: true,
      status: "bypassed",
      scanner: null,
      findings: [],
    };
  }

  if (config.enableBuiltinEicar) {
    const eicarFindings = scanEicar(buffer);
    if (eicarFindings.length > 0) {
      return {
        allowed: false,
        status: "blocked",
        scanner: "builtin-eicar",
        findings: eicarFindings,
      };
    }
  }

  if (!config.clamavHost) {
    const finding: UploadSecurityFinding = {
      code: "scanner_unavailable",
      category: "scanner",
      severity: config.malwareScanMode === "required" ? "high" : "warning",
      message: "ClamAV host is not configured.",
    };

    return {
      allowed: config.malwareScanMode !== "required",
      status: "error",
      scanner: "clamav",
      findings: [finding],
    };
  }

  try {
    const result = await scanWithClamav(buffer, config);
    if (result.infected) {
      return {
        allowed: false,
        status: "blocked",
        scanner: "clamav",
        findings: [
          {
            code: "clamav_detected",
            category: "malware",
            severity: "high",
            message: `ClamAV detected ${result.signature || "a threat"}.`,
          },
        ],
      };
    }

    return {
      allowed: true,
      status: "clean",
      scanner: "clamav",
      findings: [],
    };
  } catch (error) {
    const finding: UploadSecurityFinding = {
      code: "scanner_error",
      category: "scanner",
      severity: config.malwareScanMode === "required" ? "high" : "warning",
      message:
        error instanceof Error ? error.message : "Unknown ClamAV error",
    };

    if (config.malwareScanMode !== "required") {
      logError("upload.security.scan_failed", error, {
        filename,
        mimeType,
      });
    }

    return {
      allowed: config.malwareScanMode !== "required",
      status: "error",
      scanner: "clamav",
      findings: [finding],
    };
  }
}

function combineSecurityStatuses(statuses: UploadSecurityStatus[]) {
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("error")) return "error";
  if (statuses.includes("clean")) return "clean";
  return "bypassed";
}

function combineScannerLabels(scanners: Array<string | null>) {
  const unique = Array.from(new Set(scanners.filter(Boolean)));
  if (unique.length === 0) return null;
  return unique.join("+");
}

export async function evaluateUploadSecurity(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  dlpOverrides?: UploadDlpOverrides
): Promise<UploadSecurityResult> {
  const config = getUploadSecurityConfig();
  const checkedAt = new Date();
  const policyFindings = scanFilenamePolicy(filename, mimeType, config);

  if (policyFindings.some((finding) => finding.severity === "high")) {
    return {
      allowed: false,
      status: "blocked",
      scanner: "policy",
      findings: policyFindings,
      checkedAt,
    };
  }

  const [malwareResult, dlpResult] = await Promise.all([
    runMalwareSecurityScan(filename, mimeType, buffer, config),
    evaluateUploadDlp(filename, mimeType, buffer, dlpOverrides),
  ]);

  const findings = [
    ...policyFindings,
    ...malwareResult.findings,
    ...dlpResult.findings,
  ];
  const status = combineSecurityStatuses([
    malwareResult.status,
    dlpResult.status,
  ]);
  const allowed =
    policyFindings.every((finding) => finding.severity !== "high") &&
    malwareResult.allowed &&
    dlpResult.allowed &&
    status !== "blocked";

  return {
    allowed,
    status,
    scanner: combineScannerLabels([malwareResult.scanner, dlpResult.scanner]),
    findings,
    checkedAt,
  };
}

export function getUploadSecurityRuntimeStatus() {
  const config = getUploadSecurityConfig();
  const dlpStatus = getUploadDlpRuntimeStatus();

  return {
    malwareScanMode: config.malwareScanMode,
    clamavConfigured: Boolean(config.clamavHost),
    clamavHost: config.clamavHost,
    clamavPort: config.clamavPort,
    clamavTimeoutMs: config.clamavTimeoutMs,
    enableBuiltinEicar: config.enableBuiltinEicar,
    allowSvg: config.allowSvg,
    enforceFilenamePolicy: config.enforceFilenamePolicy,
    blockedIntermediateExtensions: config.blockedIntermediateExtensions,
    ...dlpStatus,
  };
}
