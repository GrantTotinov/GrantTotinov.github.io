import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://granttotinov.github.io/",
    title: "Grant Totinov",
    description: "Notes on .NET, open source and the things I build.",
    author: "Grant Totinov",
    profile: "https://github.com/GrantTotinov",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Europe/Sofia",
    dir: "ltr",
  },
  posts: {
    perPage: 10,
    perIndex: 10,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: false,
    editPost: {
      enabled: true,
      url: "https://github.com/GrantTotinov/GrantTotinov.github.io/edit/main/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", label: "GitHub", url: "https://github.com/GrantTotinov" },
    {
      name: "linkedin",
      label: "LinkedIn",
      url: "https://www.linkedin.com/in/granttotinov/",
    },
    { name: "devto", label: "DEV", url: "https://dev.to/granttotinov" },
    {
      name: "nuget",
      label: "NuGet",
      url: "https://www.nuget.org/profiles/GrantTotinov",
    },
    {
      name: "orcid",
      label: "ORCID",
      url: "https://orcid.org/0009-0002-8014-409X",
    },
    {
      name: "microsoft",
      label: "Microsoft Learn",
      url: "https://learn.microsoft.com/en-us/users/granttotinov/",
    },
    { name: "x", label: "X", url: "https://x.com/grantotinov" },
    {
      name: "mail",
      label: "Email",
      url: "mailto:granttotinov604@gmail.com",
    },
    { name: "rss", label: "RSS", url: "/rss.xml", linkTitle: "RSS feed" },
  ],
  support: [
    {
      name: "sponsors",
      label: "Sponsor on GitHub",
      url: "https://github.com/sponsors/GrantTotinov",
    },
    {
      name: "coffee",
      label: "Buy me a coffee",
      url: "https://buymeacoffee.com/granttotinov",
    },
  ],
  shareLinks: [
    {
      name: "linkedin",
      url: "https://www.linkedin.com/sharing/share-offsite/?url=",
    },
    { name: "x", url: "https://x.com/intent/post?url=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "reddit", url: "https://www.reddit.com/submit?url=" },
    { name: "mail", url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
