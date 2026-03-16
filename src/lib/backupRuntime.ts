import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function statPath(targetPath: string) {
  try {
    return await fs.promises.stat(targetPath);
  } catch {
    return null;
  }
}

export async function isCommandAvailable(command: string): Promise<boolean> {
  const searchPaths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);

  for (const searchPath of searchPaths) {
    const candidate = path.join(searchPath, command);
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return true;
    } catch {
      // Continue searching the next PATH entry.
    }
  }

  return false;
}

export async function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`
        )
      );
    });
  });
}

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", (error) => {
      reject(error);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}
