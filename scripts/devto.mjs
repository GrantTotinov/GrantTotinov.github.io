// Writes a dev.to-ready copy of every published post to devto/<slug>.md.
// Paste one into https://dev.to/new (Basic markdown editor). canonical_url
// points back to the blog so search engines credit the original.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const site = "https://granttotinov.github.io";
const dir = "src/content/posts";
mkdirSync("devto", { recursive: true });

for (const file of readdirSync(dir).filter(f => f.endsWith(".md"))) {
  const slug = file.slice(0, -3);
  const [, fm, body] = readFileSync(`${dir}/${file}`, "utf8").match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
  );
  if (/^draft:\s*true/m.test(fm)) continue;

  const field = key => fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))?.[1];
  // dev.to: at most 4 tags, lowercase letters and digits only
  const tags = [...fm.matchAll(/^\s+- (.+)$/gm)]
    .map(m => m[1].toLowerCase().replace(/[^a-z0-9]/g, ""))
    .slice(0, 4);

  writeFileSync(
    `devto/${slug}.md`,
    [
      "---",
      `title: ${field("title")}`,
      "published: false",
      `description: ${field("description")}`,
      `tags: ${tags.join(", ")}`,
      `canonical_url: ${site}/posts/${slug}/`,
      "---",
      "",
      // remark-toc fills this heading on the blog; on dev.to it would stay empty
      body
        .replace(/^## Table of contents\r?\n+/m, "")
        .replace(/\]\(\//g, `](${site}/`),
    ].join("\n")
  );
}
