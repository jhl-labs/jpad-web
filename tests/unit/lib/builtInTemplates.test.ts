import { describe, it, expect } from "bun:test";
import { getBuiltInTemplates } from "@/lib/builtInTemplates";

describe("builtInTemplates", () => {
  const templates = getBuiltInTemplates();

  it("모든 템플릿이 필수 필드를 가지고 있음 (name, content, icon)", () => {
    for (const template of templates) {
      expect(template.name).toBeTruthy();
      expect(template.content).toBeTruthy();
      expect(template.icon).toBeTruthy();
      expect(template.id).toBeTruthy();
      expect(template.description).toBeTruthy();
      expect(template.category).toBeTruthy();
      expect(template.isBuiltIn).toBe(true);
    }
  });

  it("템플릿 ID가 모두 고유함", () => {
    const ids = templates.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("템플릿 콘텐츠가 비어 있지 않음", () => {
    for (const template of templates) {
      expect(template.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("최소 1개 이상의 템플릿이 존재함", () => {
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it("모든 ID가 builtin- 접두사로 시작함", () => {
    for (const template of templates) {
      expect(template.id.startsWith("builtin-")).toBe(true);
    }
  });
});
