import type { CollectionEntry } from "astro:content";

/**
 * Open source projects I write about. A post joins a project's category by
 * setting `repo: <key>` in its front matter. Projects without a published
 * post are left out of the menu, so a new one can be added here ahead of time.
 */
export const CONTRIBUTIONS = {
  aspnetcore: {
    label: "ASP.NET Core",
    github: "dotnet/aspnetcore",
    blurb: "Identity, passkeys, authorization and antiforgery in ASP.NET Core.",
  },
  "spectre-console": {
    label: "Spectre.Console",
    github: "spectreconsole/spectre.console",
    blurb: "Rendering and markup fixes in the .NET console UI library.",
  },
  tiptap: {
    label: "Tiptap",
    github: "ueberdosis/tiptap",
    blurb: "The headless rich-text editor built on ProseMirror.",
  },
  "hermes-webui": {
    label: "Hermes WebUI",
    github: "nesquena/hermes-webui",
    blurb: "A community web interface for Hermes Agent.",
  },
} as const;

export type ContributionKey = keyof typeof CONTRIBUTIONS;

export const CONTRIBUTION_KEYS = Object.keys(CONTRIBUTIONS) as [
  ContributionKey,
  ...ContributionKey[],
];

/** Projects that have at least one post, in registry order. */
export function getActiveContributions(posts: CollectionEntry<"posts">[]) {
  const used = new Set(posts.map(p => p.data.repo));
  return CONTRIBUTION_KEYS.filter(key => used.has(key)).map(key => ({
    key,
    ...CONTRIBUTIONS[key],
  }));
}
