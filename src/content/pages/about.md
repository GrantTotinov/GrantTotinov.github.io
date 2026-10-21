---
title: "About"
description: "Who I am and what this blog is for."
---

I'm Grant Totinov, a .NET developer from Bulgaria. I hold an M.Eng. and spend a good part of my free time contributing to [ASP.NET Core](https://github.com/dotnet/aspnetcore), mostly in Identity and security.

Merged so far:

- [#68834](https://github.com/dotnet/aspnetcore/pull/68834): validate the COSE `alg`/`crv` combination when decoding a passkey public key
- [#67539](https://github.com/dotnet/aspnetcore/pull/67539): `SignInManager` returns `SignInResult.Failed` for an expired passkey session challenge
- [#67742](https://github.com/dotnet/aspnetcore/pull/67742): authorization metadata guard consistency
- [#66772](https://github.com/dotnet/aspnetcore/pull/66772): documenting antiforgery HTTP method limitations
- [#66747](https://github.com/dotnet/aspnetcore/pull/66747): clearer default Identity emails for people who didn't request them

## What this blog is

Write-ups of things I had to understand properly before I could fix them. Each post links to the PR, the issue and the spec it's based on, so you can check my reading against the source.

If something here is wrong, please tell me. Open an issue on [the blog's repo](https://github.com/GrantTotinov/GrantTotinov.github.io/issues) or write to me on [LinkedIn](https://www.linkedin.com/in/granttotinov/).
