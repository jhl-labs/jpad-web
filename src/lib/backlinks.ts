export interface ParsedBacklink {
  identifier: string;
  label: string | null;
}

export function formatBacklink(identifier: string, label?: string | null): string {
  const normalizedIdentifier = identifier.trim();
  const normalizedLabel = label?.trim() || null;

  if (!normalizedLabel || normalizedLabel === normalizedIdentifier) {
    return `[[${normalizedIdentifier}]]`;
  }

  return `[[${normalizedIdentifier}|${normalizedLabel}]]`;
}

export function parseBacklinks(content: string): ParsedBacklink[] {
  // Match [[link]] or [[link|label]] — no nested brackets
  const regex = /\[\[([^\[\]]+)\]\]/g;
  const unique = new Map<string, ParsedBacklink>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    if (!raw) continue;

    const [identifierPart, labelPart] = raw.split("|", 2);
    const identifier = identifierPart.trim();
    if (!identifier) continue;

    unique.set(identifier, {
      identifier,
      label: labelPart?.trim() || null,
    });
  }

  return [...unique.values()];
}
