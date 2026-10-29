---
title: "POST in, DELETE out: antiforgery and HttpMethodOverride in ASP.NET Core"
description: "UseAntiforgery() validates tokens only for POST, PUT and PATCH. Put form-field HttpMethodOverride in front of it and a cross-site POST becomes a DELETE that is never checked. Notes on PR #66772 and docs PR #37224: why the method list is what it is, a working repro on .NET 10, and what we documented."
pubDatetime: 2026-10-22T14:00:00Z
repo: aspnetcore
pr: 66772
tags:
  - aspnetcore
  - antiforgery
  - csrf
  - security
---

This one is a documentation fix, not a code fix. I still think it's one of the more useful things I've contributed, because the behaviour it documents is surprising and the failure mode is quiet.

The short version: ASP.NET Core's antiforgery middleware only validates **POST**, **PUT** and **PATCH** requests. That is by design. But if you also use `HttpMethodOverrideMiddleware` in form-field mode, and it runs first, a plain HTML form POST can arrive at a `DELETE` endpoint with no antiforgery check at all.

[@cincuranet](https://github.com/cincuranet) described the scenario in [#66687](https://github.com/dotnet/aspnetcore/issues/66687). I documented it in XML docs in [#66772](https://github.com/dotnet/aspnetcore/pull/66772) (merged 4 June 2026, `11.0-preview6`) and on the public docs page in [dotnet/AspNetCore.Docs#37224](https://github.com/dotnet/AspNetCore.Docs/pull/37224) (merged 22 June 2026).

## Table of contents

## Why only POST, PUT and PATCH

The middleware's first real decision is a method check:

```csharp
var method = context.Request.Method;
if (!HttpExtensions.IsValidHttpMethodForForm(method))
{
    return _next(context);
}
```

and `IsValidHttpMethodForForm` is:

```csharp
internal static bool IsValidHttpMethodForForm(string method) =>
    HttpMethods.IsPost(method) || HttpMethods.IsPut(method) || HttpMethods.IsPatch(method);
```

Middleware-based antiforgery is tied to form handling: the token usually travels in the form body, so the middleware looks at the methods that carry one. For CSRF this is a reasonable boundary. The attack depends on a page on another origin making the victim's browser send a request with their cookies. Under the Fetch standard, the only methods a cross-origin page can send without a CORS preflight are the [CORS-safelisted methods](https://fetch.spec.whatwg.org/#cors-safelisted-method): `GET`, `HEAD` and `POST`. A cross-origin `DELETE` triggers a preflight, and the server has to opt in. A plain `<form>` can't send `DELETE` at all.

So "DELETE isn't checked" is normally fine, because a hostile page can't send you a `DELETE` in the first place.

## How method override breaks that assumption

`HttpMethodOverrideMiddleware` exists for clients that can only send `GET` and `POST`. It has two modes:

- **Header mode** (the default) reads `X-HTTP-Method-Override`. That isn't a [CORS-safelisted request header](https://fetch.spec.whatwg.org/#cors-safelisted-request-header), so a cross-origin page can't set it without a preflight either.
- **Form-field mode** (`FormFieldName` set) reads the method from a field in a POST form, which is exactly what a hostile page can send.

In form-field mode, the browser sends a `POST`. If the override runs before antiforgery, the server rewrites it to `DELETE`, routing matches your `DELETE` endpoint, and the antiforgery middleware sees a method it doesn't validate.

The issue lists the conditions precisely. All of them have to hold:

1. `HttpMethodOverrideMiddleware` is in the pipeline (it isn't by default).
2. It's in form-field mode.
3. It runs before antiforgery.
4. The target endpoint uses antiforgery.
5. The endpoint accepts `DELETE` or another method outside POST/PUT/PATCH.

That's an unusual combination, which is why this is a docs issue and not a security advisory. But nothing warns you when you assemble it.

## A repro on .NET 10

I wanted to see it fail before writing about it. This is a complete app, run against ASP.NET Core 10.0.0:

```csharp
builder.Services.AddAntiforgery();
var app = builder.Build();

app.UseHttpMethodOverride(new HttpMethodOverrideOptions { FormFieldName = "_method" });
app.UseRouting();
app.UseAntiforgery();

app.MapPost("/items/{id}", (int id, [FromForm] string? note) => $"POST handled for {id}");
app.MapDelete("/items/{id}", (int id, [FromForm] string? note) => $"DELETE handled for {id}");
```

Both endpoints bind a form, so both get antiforgery metadata automatically. Then two form POSTs to `/items/42`, neither with a token:

```text
POST form, no token                      500  InvalidOperationException: This form is being accessed with an invalid anti-forgery token.
POST form, _method=DELETE, no token      200  DELETE handled for 42
```

The plain POST is rejected. The same POST with one extra form field reaches the `DELETE` handler.

## What we documented

The PR adds `<remarks>` in three places, so the warning shows up in IntelliSense wherever you're likely to be looking:

- `UseAntiforgery()` says it validates only POST, PUT and PATCH, says how to validate other methods yourself, and describes the method-override interaction.
- `RequireAntiforgeryTokenAttribute` says the middleware skips other methods even when the attribute is applied. I think this is the most surprising part, since the attribute's name suggests otherwise.
- `UseHttpMethodOverride()` explains when form-field mode actually rewrites the method, and points back to antiforgery.

The automated Copilot review made the wording more accurate in two places, and both corrections matter:

- My first draft implied that form-field mode always rewrites the method. It only does when the request has a form content type and the field is present and non-empty.
- My first draft also implied that antiforgery never runs for an overridden request. It does, if the override lands on POST, PUT or PATCH. The gap is only for methods outside that set.

In security documentation, an overly broad warning is also a bug. It teaches people the wrong model.

During review, [@DeagleGross](https://github.com/DeagleGross) pointed out that the public docs page was where most people would actually read this, so cincuranet asked whether I'd open a docs PR as well. #37224 adds a section to [Prevent Cross-Site Request Forgery attacks](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery) with this example:

```csharp
app.MapDelete("/item/{id}", async (int id, IAntiforgery antiforgery, HttpContext context) =>
{
    await antiforgery.ValidateRequestAsync(context);
    // Process the DELETE request
});
```

plus a warning box with three mitigations.

## What to do in your app

If you use `UseHttpMethodOverride` with `FormFieldName`:

- Put it after antiforgery if your pipeline allows that. In practice it often can't, because the override has to run before routing to change which endpoint matches.
- Don't use form-field override for endpoints that rely on antiforgery.
- Or validate explicitly in those handlers with `IAntiforgery.ValidateRequestAsync`, as above. This is the option that doesn't depend on middleware order.

## What this doesn't solve

Documentation only helps people who read it. The issue also floated a Roslyn analyzer that would flag `UseHttpMethodOverride` with `FormFieldName` registered before `UseAntiforgery`. That would catch the problem where it's written, and it's still open as an idea.

## References

1. dotnet/aspnetcore issue [#66687](https://github.com/dotnet/aspnetcore/issues/66687): Document antiforgery skip in AntiforgeryMiddleware for DELETE via HttpMethodOverride.
2. dotnet/aspnetcore PR [#66772](https://github.com/dotnet/aspnetcore/pull/66772): Document antiforgery HTTP method limitations and HttpMethodOverride interaction.
3. dotnet/AspNetCore.Docs PR [#37224](https://github.com/dotnet/AspNetCore.Docs/pull/37224): the docs page section and warning.
4. WHATWG, [Fetch Standard](https://fetch.spec.whatwg.org/): CORS-safelisted method and CORS-safelisted request-header.
5. Microsoft Learn, [Prevent Cross-Site Request Forgery (XSRF/CSRF) attacks in ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery).
