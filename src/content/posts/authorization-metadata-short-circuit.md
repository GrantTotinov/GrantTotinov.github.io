---
title: "Three ways to say [Authorize], one way to check it: fixing ASP.NET Core's security-metadata guard"
description: "ASP.NET Core routing refuses to run an endpoint whose authorization metadata nothing will enforce. That guard only recognized one of the three kinds of authorization metadata. Notes on PR #67742: where the gap was, a short-circuited endpoint that served 200 without authentication on .NET 10, and the fix."
pubDatetime: 2026-10-22T15:00:00Z
repo: aspnetcore
pr: 67742
tags:
  - aspnetcore
  - authorization
  - routing
  - security
---

ASP.NET Core has a safety net that most people only ever meet as an error message. If an endpoint says it needs authorization, but nothing in the pipeline is going to enforce that, routing throws instead of running the endpoint:

```text
Endpoint Test contains authorization metadata, but a middleware was not found that supports authorization.
Configure your application startup by adding app.UseAuthorization() in the application startup code.
```

That is a fail-closed check, and it's a good one. The problem, described in [dotnet/aspnetcore#67559](https://github.com/dotnet/aspnetcore/issues/67559), was that it only knew about one of the three ways you can attach authorization to an endpoint. I fixed that in [#67742](https://github.com/dotnet/aspnetcore/pull/67742), merged on 22 July 2026 for the `11.0-rc1` milestone.

To be upfront about credit: the issue was opened by [@rokonec](https://github.com/rokonec) and already described the fix, down to the helper method. My part was implementing it, writing the tests and getting it through review. This post is mostly about why the gap mattered, because that part wasn't obvious to me until I tried it.

## Table of contents

## Three shapes of authorization metadata

When `AuthorizationMiddleware` runs, it hands the endpoint's metadata to `AuthorizationPolicy.CombineAsync`, and the doc comment on that method is precise about what it looks at. Only items that are `IAuthorizeData`, `AuthorizationPolicy` or `IAuthorizationRequirementData` "contribute to the result; other items are ignored."

| Shape                           | Where it usually comes from                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `IAuthorizeData`                | `[Authorize]`, `RequireAuthorization()`, `RequireAuthorization("PolicyName")`                                               |
| `AuthorizationPolicy`           | `RequireAuthorization(policy)`, or a policy object added as metadata directly (`WithMetadata(policy)`, a custom convention) |
| `IAuthorizationRequirementData` | Custom attributes that carry their own requirements, so you don't have to register a named policy                           |

All three mean "this endpoint needs authorization". `AuthorizationMiddleware` treats them as equals.

## Where the guard lives

Routing checks for unenforced authorization metadata in two places:

1. **`EndpointMiddleware.Invoke`**, just before an endpoint runs. If the endpoint has authorization metadata and `AuthorizationMiddleware` never marked the request as seen, it throws. This is what catches a forgotten `app.UseAuthorization()`.
2. **`EndpointRoutingMiddleware.ExecuteShortCircuit`**. Endpoints marked with `.ShortCircuit()` run straight from routing, skipping every middleware after it, including authorization. So routing refuses to short-circuit an endpoint that carries authorization metadata.

Both places had a comment saying the check "should be kept in sync" with the other one and with the authorization middleware. Both checked only this:

```csharp
endpoint.Metadata.GetMetadata<IAuthorizeData>() is not null
```

So an endpoint whose only authorization metadata was an `AuthorizationPolicy` or an `IAuthorizationRequirementData` passed the guard as if it had none.

## What that looked like in a running app

The issue calls this a "consistency / defense-in-depth gap", which is accurate. I still wanted to see what it meant in practice, so I wrote a small app against ASP.NET Core 10.0.0, which doesn't have the fix:

```csharp
builder.Services.AddAuthentication("cookie").AddCookie("cookie");
builder.Services.AddAuthorization();
var app = builder.Build();

var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();

app.MapGet("/require-authorization", () => "secret").RequireAuthorization(policy).ShortCircuit();
app.MapGet("/with-metadata", () => "secret").WithMetadata(policy).ShortCircuit();
app.MapGet("/with-metadata-no-shortcircuit", () => "secret").WithMetadata(policy);
```

Then I requested each route anonymously:

```text
/require-authorization           500
/with-metadata                   200 secret
/with-metadata-no-shortcircuit   302
```

- `/require-authorization` fails with the guard's exception, "Endpoint HTTP: GET /require-authorization contains authorization metadata, but this endpoint is marked with short circuit and it will execute on Routing Middleware." That's the intended behaviour: you asked for authorization and a short circuit, and you can't have both.
- `/with-metadata-no-shortcircuit` goes through `AuthorizationMiddleware`, which sees the policy and redirects the anonymous user to the cookie login page.
- `/with-metadata` returns the response to an anonymous request. The endpoint has a policy that requires an authenticated user, and nothing enforced it.

The first route was safe because of a detail in `RequireAuthorization(policy)`. It doesn't only add the policy:

```csharp
// Only add an authorize attribute if there isn't one
if (!endpointBuilder.Metadata.Any(meta => meta is IAuthorizeData))
{
    endpointBuilder.Metadata.Add(new AuthorizeAttribute());
}
endpointBuilder.Metadata.Add(policy);
```

That extra `AuthorizeAttribute` is what the guard was actually seeing. Take the convenience method away and add the same policy as plain metadata, and the guard goes quiet.

How likely is this in a real app? You need two things: authorization expressed only as a policy object or as requirement data, and either `.ShortCircuit()` or a pipeline without `UseAuthorization()`. That's not the common path, and I wouldn't call it a vulnerability in ASP.NET Core. It's a misconfiguration that the framework promises to catch and didn't. When it goes unnoticed, the result fails open, which is the opposite of what the guard is for.

## The fix

One internal helper in the routing project, checking the same three shapes `CombineAsync` uses:

```csharp
internal static class AuthorizationMetadataHelper
{
    // This check should be kept in sync with the policy computation in AuthorizationMiddleware.
    public static bool HasAuthorizationMetadata(Endpoint endpoint) =>
        endpoint.Metadata.GetMetadata<IAuthorizeData>() is not null
        || endpoint.Metadata.GetMetadata<AuthorizationPolicy>() is not null
        || endpoint.Metadata.GetMetadata<IAuthorizationRequirementData>() is not null;
}
```

Both guard sites now call it:

```csharp
// EndpointMiddleware.Invoke
if (AuthorizationMetadataHelper.HasAuthorizationMetadata(endpoint) &&
    !httpContext.Items.ContainsKey(AuthorizationMiddlewareInvokedKey))
{
    ThrowMissingAuthMiddlewareException(endpoint);
}

// EndpointRoutingMiddleware.ExecuteShortCircuit
if (AuthorizationMetadataHelper.HasAuthorizationMetadata(endpoint))
{
    ThrowCannotShortCircuitAnAuthRouteException(endpoint);
}
```

I only extracted the "does this endpoint have authorization metadata" part. The rest of each guard, like the `AuthorizationMiddlewareInvokedKey` check, stays where it was, because the two call sites ask different questions about the same metadata. No public API changed, and the routing project already referenced `Microsoft.AspNetCore.Authorization`, so there was no new dependency either.

If you rely on the old behaviour for some reason, `RouteOptions.SuppressCheckForUnhandledSecurityMetadata` still turns all of these checks off. I'd think hard before using it.

## Tests

Four new tests, one per metadata shape per guard site:

- `EndpointMiddlewareTest`: `Invoke` throws when authorization middleware didn't run and the endpoint carries only an `AuthorizationPolicy`, or only an `IAuthorizationRequirementData`.
- `EndpointRoutingMiddlewareTest`: `ExecuteShortCircuit` throws for a short-circuited endpoint with only an `AuthorizationPolicy`, or only an `IAuthorizationRequirementData`.

The `EndpointMiddleware` tests assert the full error message, so a future change to the wording shows up as a test failure rather than as a silent difference between the two shapes. The automated review also caught that my first version of the routing tests was missing a `using Microsoft.AspNetCore.Authorization;` and wouldn't compile. That's embarrassing, but it's exactly what automated review is for.

## What this doesn't solve

The helper moves the "keep these in sync" problem into one place. It doesn't remove it. If `AuthorizationMiddleware` ever learns a fourth kind of authorization metadata, the helper needs the same change, and the only thing that says so is the comment. A stronger fix would be one shared definition that both the middleware and the guard call. That crosses assembly boundaries, though, and it was more than the issue asked for.

## If you configure endpoints by hand

- If you add an `AuthorizationPolicy` with `WithMetadata` or in a custom convention, you're relying on `UseAuthorization()` being in the pipeline. On .NET 10 nothing checks that for you.
- Don't combine `.ShortCircuit()` with authorization of any shape. On .NET 11 the guard rejects it; before that, only the `[Authorize]` shape was rejected.
- A quick test for any endpoint that should be protected: request it anonymously in an integration test and assert you don't get a 200.

## References

1. dotnet/aspnetcore issue [#67559](https://github.com/dotnet/aspnetcore/issues/67559): Unhandled-security-metadata guard misses AuthorizationPolicy and IAuthorizationRequirementData.
2. dotnet/aspnetcore PR [#67742](https://github.com/dotnet/aspnetcore/pull/67742): Fix unhandled-security-metadata guard to cover AuthorizationPolicy and IAuthorizationRequirementData.
3. Microsoft Learn, [Short-circuit middleware after routing](https://learn.microsoft.com/aspnet/core/fundamentals/routing#short-circuit-middleware-after-routing).
4. Microsoft Learn, [Custom authorization policies with IAuthorizationRequirementData](https://learn.microsoft.com/aspnet/core/security/authorization/iard).
