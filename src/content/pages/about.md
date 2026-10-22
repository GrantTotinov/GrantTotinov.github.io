---
title: "About"
description: "Who I am and what this blog is for."
---

I'm Grant Totinov, a software engineer from Bulgaria with a Master's degree in Computer Engineering. I'm a member of the [.NET Foundation](https://dotnetfoundation.org) and a Microsoft Q&A Community Champion, and I spend a good part of my free time contributing to open source.

I also build [AI Exporter](/projects/), a free browser extension that saves AI chats from ChatGPT, Claude, Gemini and twelve other sites as PDF, Word, Markdown and more.

Merged so far:

- **ASP.NET Core**
  - [#68834](https://github.com/dotnet/aspnetcore/pull/68834): validate the COSE `alg`/`crv` combination when decoding a passkey public key
  - [#67539](https://github.com/dotnet/aspnetcore/pull/67539): `SignInManager` returns `SignInResult.Failed` for an expired passkey session challenge
  - [#67742](https://github.com/dotnet/aspnetcore/pull/67742): authorization metadata guard consistency
  - [#66772](https://github.com/dotnet/aspnetcore/pull/66772) and [AspNetCore.Docs#37224](https://github.com/dotnet/AspNetCore.Docs/pull/37224): documenting antiforgery HTTP method limitations
  - [#66747](https://github.com/dotnet/aspnetcore/pull/66747): clearer default Identity emails for people who didn't request them
- **Spectre.Console**
  - [#2101](https://github.com/spectreconsole/spectre.console/pull/2101): `Align` measurement respects an explicit width
  - [#2118](https://github.com/spectreconsole/spectre.console/pull/2118): escape every interpolated markup argument, not just strings
- **Tiptap**
  - [#7832](https://github.com/ueberdosis/tiptap/pull/7832): forward `getReferencedVirtualElement` in the React drag handle

Each of these has a write-up under [Contributions](/contributions/).

## What this blog is

Write-ups of things I had to understand properly before I could fix them. Each post links to the PR, the issue and the spec it's based on, so you can check my reading against the source.

If something here is wrong, please tell me. Open an issue on [the blog's repo](https://github.com/GrantTotinov/GrantTotinov.github.io/issues) or write to me on [LinkedIn](https://www.linkedin.com/in/granttotinov/).
