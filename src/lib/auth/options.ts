import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { extractClientIp, rateLimitRedis } from "@/lib/rateLimit";
import { logError } from "@/lib/logger";
import {
  getSamlConfig,
  isCredentialsLoginEnabled,
  normalizeEmailAddress,
} from "@/lib/auth/config";
import { getOidcProvider, reconcileOidcUser } from "@/lib/auth/oidc";
import { consumeSsoLoginToken } from "@/lib/auth/ssoLoginToken";
import { autoJoinOrganizationsForUser } from "@/lib/organizations";

const providers: NextAuthOptions["providers"] = [];

if (isCredentialsLoginEnabled()) {
  providers.push(
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip = extractClientIp(req?.headers);
        const allowed = await rateLimitRedis(`login:${ip}`, 10, 60_000);
        if (!allowed) {
          logError("auth.login.rate_limit_exceeded", new Error("Login rate limit exceeded"), {
            ip,
            email: credentials.email,
          });
          return null;
        }

        const email = normalizeEmailAddress(credentials.email);
        const matchedUsers = await prisma.user.findMany({
          where: {
            email: {
              equals: email,
              mode: "insensitive",
            },
          },
          take: 2,
        });

        if (matchedUsers.length !== 1) return null;

        const user = matchedUsers[0];
        if (!user?.hashedPassword) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        );

        if (!isValid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await autoJoinOrganizationsForUser(user.id, user.email);

        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

const oidcProvider = getOidcProvider();
if (oidcProvider) {
  providers.push(oidcProvider);
}

const samlProvider = getSamlConfig();
if (samlProvider) {
  providers.push(
    CredentialsProvider({
      id: "saml",
      name: samlProvider.name,
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const rawToken = credentials?.token?.trim();
        if (!rawToken) return null;

        const user = await consumeSsoLoginToken({
          provider: "saml",
          rawToken,
        });

        if (!user) return null;

        await autoJoinOrganizationsForUser(user.id, user.email);
        return user;
      },
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "oidc") {
        return true;
      }

      const result = await reconcileOidcUser({
        user,
        account,
        profile,
      });

      if (!result.ok) {
        return `/login?error=${encodeURIComponent(result.error)}`;
      }

      user.id = result.user.id;
      user.email = result.user.email;
      user.name = result.user.name;
      await autoJoinOrganizationsForUser(result.user.id, result.user.email);
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
};
