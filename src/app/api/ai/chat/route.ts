import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { readPage } from "@/lib/git/repository";
import { aiComplete, AI_PROMPTS, AiError, resolveAiWorkspaceContext } from "@/lib/ai";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { listAccessiblePages } from "@/lib/pageAccess";
import { buildSemanticContext, findRelevantDocumentChunks } from "@/lib/semanticSearch";

interface ChatHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);

    if (!(await rateLimitRedis(`ai-chat:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { workspaceId, question, pageId, usePageContext, history } = (await req.json()) as {
      workspaceId: string;
      question: string;
      pageId?: string;
      usePageContext?: boolean;
      history?: ChatHistoryEntry[];
    };

    if (!workspaceId || !question) {
      return NextResponse.json(
        { error: "workspaceId and question are required" },
        { status: 400 }
      );
    }

    if (typeof question !== "string" || question.length > 5000) {
      return NextResponse.json(
        { error: "question must be a string of 5000 characters or less" },
        { status: 400 }
      );
    }

    if (Array.isArray(history)) {
      const validRoles = new Set(["user", "assistant"]);
      for (const entry of history) {
        if (!entry || typeof entry.role !== "string" || !validRoles.has(entry.role)) {
          return NextResponse.json(
            { error: "Each history entry must have role 'user' or 'assistant'" },
            { status: 400 }
          );
        }
        if (typeof entry.content === "string" && entry.content.length > 10000) {
          return NextResponse.json(
            { error: "Each history entry content must be 10000 characters or less" },
            { status: 400 }
          );
        }
      }
    }

    const { member, pages: accessiblePages } = await listAccessiblePages(
      user.id,
      workspaceId
    );
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pageContextId = usePageContext === false ? undefined : pageId;
    const contextInfo = await resolveAiWorkspaceContext(user.id, {
      workspaceId,
      pageId: pageContextId,
    });

    let context: string;
    let semanticMatchCount = 0;

    if (contextInfo.page) {
      // Use only the specified page as context
      const content = await readPage(contextInfo.workspaceId, contextInfo.page.slug);
      context = content
        ? `## ${contextInfo.page.title}\n${content}`
        : `## ${contextInfo.page.title}\n(No content)`;
    } else {
      const semanticMatches = await findRelevantDocumentChunks(
        contextInfo.workspaceId,
        question,
        accessiblePages.map((page) => ({
          id: page.id,
          title: page.title,
          slug: page.slug,
          icon: page.icon,
          updatedAt: page.updatedAt,
        })),
        6
      );

      semanticMatchCount = semanticMatches.length;
      if (semanticMatches.length > 0) {
        context = buildSemanticContext(semanticMatches);
      } else {
        const topPages = [...accessiblePages]
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, 10);
        const pageResults = await Promise.all(
          topPages.map(async (page) => {
            const content = await readPage(contextInfo.workspaceId, page.slug);
            return content ? `## ${page.title}\n${content}` : null;
          })
        );
        const pageContents = pageResults.filter((c): c is string => c !== null);

        context =
          pageContents.length > 0
            ? pageContents.join("\n\n---\n\n")
            : "(No documents found in this workspace)";
      }
    }

    const lang = "한국어";
    const systemPrompt = AI_PROMPTS.qaSystem(context, lang);
    const normalizedHistory = Array.isArray(history)
      ? history
          .slice(-6)
          .filter((entry) => entry && typeof entry.content === "string")
          .map((entry) => ({
            role: entry.role,
            content: entry.content,
          }))
      : [];
    const historyContext = normalizedHistory
      .map((entry) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
      .join("\n");
    const questionIncluded =
      normalizedHistory.at(-1)?.role === "user" &&
      normalizedHistory.at(-1)?.content === question;
    const prompt = historyContext
      ? `${historyContext}${questionIncluded ? "" : `\nUser: ${question}`}`
      : question;
    const answer = await aiComplete(
      contextInfo.workspaceId,
      systemPrompt,
      prompt,
      4096,
      "chat"
    );

    // Save both the user question and assistant answer to AiChat
    await prisma.aiChat.createMany({
      data: [
        {
          role: "user",
          content: question,
          pageId: contextInfo.page?.id || null,
          workspaceId: contextInfo.workspaceId,
          userId: user.id,
        },
        {
          role: "assistant",
          content: answer,
          pageId: contextInfo.page?.id || null,
          workspaceId: contextInfo.workspaceId,
          userId: user.id,
        },
      ],
    });

    await recordAuditLog({
      action: "ai.chat.completed",
      actor: createAuditActor(user, member.role),
      workspaceId: contextInfo.workspaceId,
      pageId: contextInfo.page?.id ?? null,
      targetType: "ai",
      metadata: {
        usedPageContext: Boolean(contextInfo.page),
        historySize: normalizedHistory.length,
        semanticMatchCount,
      },
      context: requestContext,
    });

    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof AiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError("ai.chat.failed", error, {}, req);
    return NextResponse.json(
      { error: "Chat processing failed" },
      { status: 500 }
    );
  }
}
