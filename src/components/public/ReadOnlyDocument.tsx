import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

async function sanitizeHtml(html: string): Promise<string> {
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(html);
  return String(result);
}

interface NavItem {
  title: string;
  href: string;
  active?: boolean;
}

export async function ReadOnlyDocument({
  workspaceName,
  title,
  html,
  navItems = [],
  badge,
}: {
  workspaceName: string;
  title: string;
  html: string;
  navItems?: NavItem[];
  badge?: string;
}) {
  return (
    <div className="flex min-h-screen" style={{ background: "var(--background)" }}>
      {navItems.length > 0 && (
        <nav
          className="hidden md:block w-64 p-4 shrink-0"
          style={{
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--border)",
          }}
        >
          <h2 className="font-bold mb-1">{workspaceName}</h2>
          {badge && (
            <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
              {badge}
            </p>
          )}
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-sm block py-1 px-2 rounded"
                  style={{
                    background: item.active ? "var(--sidebar-hover)" : undefined,
                    color: item.active ? "var(--foreground)" : "var(--muted)",
                  }}
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className="flex-1 max-w-4xl p-6 md:p-8">
        <div className="mb-6">
          <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
            {workspaceName}
            {badge ? ` · ${badge}` : ""}
          </p>
          <h1
            className="text-3xl font-bold"
            style={{
              borderBottom: "2px solid var(--border)",
              paddingBottom: "0.5rem",
            }}
          >
            {title}
          </h1>
        </div>
        <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: await sanitizeHtml(html) }} />
      </main>
    </div>
  );
}
