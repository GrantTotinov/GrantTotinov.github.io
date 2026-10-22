---
title: "Five minutes on the login page: an expired passkey challenge shouldn't be a 500"
description: "If a user left the login page open for more than five minutes and then signed in with a passkey, ASP.NET Core Identity threw instead of returning SignInResult.Failed. Notes on PR #67539: where the challenge actually lives, why it expires, and where to draw the line between a failed sign-in and a programming error."
pubDatetime: 2026-10-22T13:00:00Z
repo: aspnetcore
tags:
  - aspnetcore
  - identity
  - passkeys
  - webauthn
---

Here is the bug report, [dotnet/aspnetcore#67410](https://github.com/dotnet/aspnetcore/issues/67410), in one sentence: open the login page, go and make a coffee, come back, click "Sign in with a passkey", and get an HTTP 500.

On .NET 10.0.0, `SignInManager.PasskeySignInAsync` threw an `InvalidOperationException` when the server-side challenge for the sign-in had expired, instead of returning `SignInResult.Failed`. My fix is [#67539](https://github.com/dotnet/aspnetcore/pull/67539), merged on 19 August 2026 and backported to `release/11.0-rc1` in [#68654](https://github.com/dotnet/aspnetcore/pull/68654), so it ships in .NET 11.

The code change is small. What I found worth writing down is where the challenge lives, why it has to expire, and a review comment that changed what my fix returned.

## Table of contents

## Where the challenge lives

A passkey sign-in is two requests. First the page asks the server for options, which include a random challenge. The browser has the authenticator sign that challenge, and then the page posts the signed result back. The server has to remember the challenge in between, because the WebAuthn spec ([§13.4.3](https://www.w3.org/TR/webauthn-3/#sctn-cryptographic-challenges)) requires it:

> the returned challenge value in the client's response MUST match what was generated. This SHOULD be done in a fashion that does not rely upon a client's behavior, e.g., the Relying Party SHOULD store the challenge temporarily until the operation is complete.

I expected ASP.NET Core Identity to keep it in session state. It doesn't. `MakePasskeyRequestOptionsAsync` stores the operation and its state in the authentication properties of a short-lived cookie, under the same `Identity.TwoFactorUserId` scheme that two-factor sign-in uses:

```csharp
private async Task StorePasskeyAuthenticationInfoAsync(string operation, string? state)
{
    var props = new AuthenticationProperties();
    props.Items[PasskeyOperationKey] = operation;
    props.Items[PasskeyStateKey] = state;
    var claimsIdentity = new ClaimsIdentity(IdentityConstants.TwoFactorUserIdScheme);
    var claimsPrincipal = new ClaimsPrincipal(claimsIdentity);
    await Context.SignInAsync(IdentityConstants.TwoFactorUserIdScheme, claimsPrincipal, props);
}
```

That cookie is registered with a fixed lifetime:

```csharp
builder.AddCookie(IdentityConstants.TwoFactorUserIdScheme, o =>
{
    o.Cookie.Name = IdentityConstants.TwoFactorUserIdScheme;
    // ...
    o.ExpireTimeSpan = TimeSpan.FromMinutes(5);
});
```

Reading it back also signs it out, so a challenge can only be used once:

```csharp
var result = await Context.AuthenticateAsync(IdentityConstants.TwoFactorUserIdScheme);
await Context.SignOutAsync(IdentityConstants.TwoFactorUserIdScheme);
```

So the five minutes in the bug report isn't arbitrary. It's this cookie, and it lines up with the spec: WebAuthn recommends a ceremony timeout between 300,000 and 600,000 milliseconds, with five minutes as the default ([§15.1](https://www.w3.org/TR/webauthn-3/#recommended-range-and-default-for-a-webauthn-ceremony-timeout)). Identity's `IdentityPasskeyOptions.AuthenticatorTimeout` also defaults to five minutes.

## What went wrong

When the cookie had expired, `AuthenticateAsync` found nothing and the stored passkey info came back as `null`. `PasskeySignInCoreAsync` didn't check for that. It went straight into `PerformPasskeyAssertionAsync`, which treats "no assertion is underway" as a programming error and throws. That exception went all the way up through `PasskeySignInAsync` to the app.

The reporter put it well: every other `SignInManager` sign-in method returns a result for expected failures. A wrong password from `PasswordSignInAsync` is `SignInResult.Failed`, not an exception. An expired challenge is the same kind of thing, and it isn't rare either. People leave login pages open all the time.

## The fix

`PasskeySignInCoreAsync` now looks up the passkey state itself, before attempting the assertion:

```csharp
private async Task<SignInResult> PasskeySignInCoreAsync(string credentialJson)
{
    ThrowIfNoPasskeyHandler();
    ArgumentException.ThrowIfNullOrEmpty(credentialJson);

    var passkeyInfo = await RetrievePasskeyAuthenticationInfoAsync();
    if (passkeyInfo is null)
    {
        return SignInResult.Failed;
    }

    if (!string.Equals(PasskeyOperations.Assertion, passkeyInfo.Operation, StringComparison.Ordinal))
    {
        throw new InvalidOperationException(
            $"Expected passkey operation '{PasskeyOperations.Assertion}', but got '{passkeyInfo.Operation}'. " +
            $"This may indicate that you have not previously called '{nameof(SignInManager<>)}.{nameof(MakePasskeyRequestOptionsAsync)}()'.");
    }

    var assertionResult = await PerformPasskeyAssertionAsync(credentialJson);
    // ... unchanged from here
}
```

`RetrievePasskeyAuthenticationInfoAsync` caches its result for the request, so the later call inside `PerformPasskeyAssertionAsync` doesn't read the cookie a second time.

## Failed sign-in or programming error?

My first version returned `SignInResult.Failed` in two cases: when the state was missing, and when the stored operation wasn't `"Assertion"`. The automated Copilot review pointed out that the second case is different:

> That changes the existing behavior for a likely developer misuse case (e.g., calling PasskeySignInAsync after MakePasskeyCreationOptionsAsync), which previously threw an InvalidOperationException with a clear diagnostic message.

It was right, and the distinction is the most useful thing I took from this PR:

- **Missing state** happens to correctly written apps, because of the user's timing. The caller should be able to handle it as an ordinary failed sign-in.
- **The wrong operation** only happens if the app called the API in the wrong order. Turning that into `Failed` would hide a bug behind a "please try again" message. A loud exception during development is more helpful.

So the fix returns `Failed` for the first case and keeps throwing for the second.

[@halter73](https://github.com/halter73) then suggested calling `ThrowIfNoPasskeyHandler()` here as well, as the very first line, ahead of the argument check and the state lookup. If passkeys aren't configured at all, that's also a programming error, and it should be reported the same way as in the other passkey entry points, whether or not a challenge happens to exist. In his words, this "likely isn't reachable in a normally configured app, but it preserves the existing behavior when state is missing and keeps the handler check consistent with the other passkey entry points."

## Tests

`PasskeySignInReturnsFailedWhenSessionChallengeHasExpired` simulates the expired cookie by making `AuthenticateAsync` for the two-factor scheme fail, then checks three things:

```csharp
Assert.Same(SignInResult.Failed, signInResult);
passkeyHandler.Verify(h => h.PerformAssertionAsync(It.IsAny<PasskeyAssertionContext>()), Times.Never);
auth.Verify();
```

The middle line came from review. Returning `Failed` isn't enough on its own. The test should also prove that we never got as far as asking the passkey handler to verify a signature against a challenge we don't have. The automated review also noticed that my first version called `auth.Verify()` without marking the setups `Verifiable()`, which meant that line checked nothing.

## What this doesn't fix

`SignInResult.Failed` doesn't say why the sign-in failed. A login page can't tell "your challenge expired" from "that passkey isn't valid" without extra work, so the most a UI can say is "that didn't work, please try again". In practice that is the right advice for both cases, because trying again requests fresh options and a new challenge.

There's also something to watch if you change the defaults. The challenge's lifetime is the `Identity.TwoFactorUserId` cookie's `ExpireTimeSpan`, not `IdentityPasskeyOptions.AuthenticatorTimeout`. As far as I can tell from the source, if you raise `AuthenticatorTimeout` to ten minutes, the browser will keep the ceremony open for ten minutes while the server forgets the challenge after five. Since the fix, that shows up as `Failed` rather than a 500. If you change one of these settings, change the other as well, and remember that the same cookie also carries the two-factor sign-in flow.

## References

1. dotnet/aspnetcore issue [#67410](https://github.com/dotnet/aspnetcore/issues/67410): SignInManager.PasskeySignInAsync throws InvalidOperationException when session challenge has expired.
2. dotnet/aspnetcore PR [#67539](https://github.com/dotnet/aspnetcore/pull/67539), and backport [#68654](https://github.com/dotnet/aspnetcore/pull/68654) to `release/11.0-rc1`.
3. W3C, [Web Authentication Level 3](https://www.w3.org/TR/webauthn-3/), §13.4.3 Cryptographic Challenges and §15.1 recommended ceremony timeout.
4. Microsoft Learn, [ASP.NET Core passkeys documentation](https://learn.microsoft.com/aspnet/core/security/authentication/passkeys/).
