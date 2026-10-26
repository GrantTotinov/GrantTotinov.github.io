import aiExporterIcon from "@/assets/images/aiexporter-icon.png";
import pixelForgeIcon from "@/assets/images/pixelforge-icon.png";

/** Projects I build and maintain myself, shown on the home and projects pages. */
export const PROJECTS = {
  aiExporter: {
    name: "AI Exporter",
    icon: aiExporterIcon,
    description:
      "A free browser extension that saves your ChatGPT, Claude, Gemini and twelve other AI chats as PDF, Word, Markdown, Excel and five more formats, images included. Everything happens locally in your browser.",
    links: [
      {
        label: "Chrome Web Store",
        href: "https://chromewebstore.google.com/detail/objkcakdcilfaphifjfcgfamlnnbinjc",
      },
      { label: "Website", href: "https://granttotinov.github.io/AIExporter/" },
      {
        label: "Source on GitHub",
        href: "https://github.com/GrantTotinov/AIExporter",
      },
    ],
  },
  pixelForge: {
    name: "PixelForge",
    icon: pixelForgeIcon,
    description:
      "An MIT image processing library for .NET 8 and newer, built on SkiaSharp. It has the same Load, Mutate and Save API as ImageSharp, needs no license key, and comes with safe defaults for user uploads.",
    links: [
      { label: "NuGet", href: "https://www.nuget.org/packages/PixelForge" },
      {
        label: "Source on GitHub",
        href: "https://github.com/GrantTotinov/PixelForge",
      },
    ],
  },
};

export type Project = (typeof PROJECTS)[keyof typeof PROJECTS];
