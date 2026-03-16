import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const DEFAULT_TOKEN_TTL_MS = 5 * 60 * 1000;

function hashToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function createSsoLoginToken(params: {
  provider: string;
  userId: string;
  ttlMs?: number;
}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (params.ttlMs ?? DEFAULT_TOKEN_TTL_MS));

  await prisma.ssoLoginToken.create({
    data: {
      provider: params.provider,
      userId: params.userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function consumeSsoLoginToken(params: {
  provider: string;
  rawToken: string;
}) {
  const now = new Date();
  const tokenHash = hashToken(params.rawToken);

  return prisma.$transaction(async (tx) => {
    const loginToken = await tx.ssoLoginToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        provider: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!loginToken || loginToken.provider !== params.provider) {
      return null;
    }

    await tx.ssoLoginToken.delete({
      where: { id: loginToken.id },
    });

    if (loginToken.expiresAt <= now) {
      return null;
    }

    return loginToken.user;
  });
}
