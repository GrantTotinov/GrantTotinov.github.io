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
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: false,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/GrantTotinov/GrantTotinov.github.io/edit/main/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github",   url: "https://github.com/GrantTotinov" },
    { name: "x",        url: "https://x.com/grantotinov" },
    { name: "linkedin", url: "https://www.linkedin.com/in/granttotinov/" },
    { name: "mail",     url: "mailto:granttotinov604@gmail.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
