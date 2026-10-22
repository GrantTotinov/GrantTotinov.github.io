---
title: '"If you didn''t request this, you can ignore it": the default Identity emails go to strangers too'
description: "Anyone can type any address into a register or forgot-password form, so ASP.NET Core Identity's default emails regularly reach people who never asked for them. Notes on PR #66747: where that text actually ships, a wording problem caught in review, and a test that turned out to be parsing the email."
pubDatetime: 2026-10-22T10:00:00Z
repo: aspnetcore
tags:
  - aspnetcore
  - identity
  - security
---

A registration form and a forgot-password form have something in common: whoever fills them in chooses where the email goes. Sometimes that's a typo. Sometimes it's someone trying an address to see what happens. Either way, the email lands with a person who didn't start anything, and until recently ASP.NET Core Identity's default text gave them nothing but a link:

> Please reset your password by clicking here.

[@rokonec](https://github.com/rokonec) opened [#66643](https://github.com/dotnet/aspnetcore/issues/66643) to add a sentence for that reader. I made the change in [#66747](https://github.com/dotnet/aspnetcore/pull/66747), merged on 8 June 2026 for `11.0-preview6`. It's a small change, and I want to be honest about that. Two things about it still surprised me, and they're the reason for this post.

## Table of contents

## Who actually receives this text

It's easy to assume this is template text that everyone replaces. Some of it is. But the main copy lives in `src/Shared/DefaultMessageEmailSender.cs`, and `AddIdentityApiEndpoints` registers it as the default:

```csharp
builder.Services.TryAddTransient(typeof(IEmailSender<>), typeof(DefaultMessageEmailSender<>));
builder.Services.TryAddTransient<IEmailSender, NoOpEmailSender>();
```

`DefaultMessageEmailSender<TUser>` wraps the simple `IEmailSender` interface, the one with a single `SendEmailAsync(email, subject, htmlMessage)` method. If your app plugs in a real mail provider by implementing only `IEmailSender`, which is the obvious thing to do, the subject and body come from this class. So this text goes to real inboxes in production apps that never wrote a line of email copy.

## What changed

Each message gets one sentence for the person who didn't ask:

| Message             | Added sentence                                                            |
| ------------------- | ------------------------------------------------------------------------- |
| Confirmation link   | If you didn't request this email confirmation, you can ignore this email. |
| Password reset link | If you didn't request a password reset, you can ignore this email.        |
| Password reset code | If you didn't request a password reset, you can ignore this email.        |

The same wording went into the Blazor Web App template's `IdentityNoOpEmailSender` and into the `Identity.ExternalClaims` sample.

The issue also listed `src/Identity/UI/src/Services/EmailSenderExtensions.cs`, which doesn't exist. I checked against `main` and said so in the PR description instead of creating a file to match the issue. It's a small thing, but issue text is a description of the code as someone remembered it, and checking it is part of the job.

## The wording that review caught

The issue proposed "If you didn't create an account, you can ignore this email" for the confirmation message, and I used it as written. The automated Copilot review flagged it:

> The follow-up sentence "If you didn't create an account" can be misleading because SendConfirmationLinkAsync is also used for scenarios like email verification/resend and email change confirmation (not just new account creation).

rokonec agreed, and the merged text says "If you didn't request this email confirmation". The point generalizes. A message attached to a method is only right if it's right for every caller of that method. "Didn't create an account" is wrong for someone who changed their address on an account they've had for years, and an email that is wrong in that situation is the kind people learn to distrust.

## A test that parsed the email

The PR also had to touch one test, and not one you'd guess. `MapIdentityApiTests` drives the forgot-password flow end to end and extracts the reset code from the email body with a regex:

```csharp
// before
var confirmationMatch = Regex.Match(email.HtmlMessage, "code: (.*?)$");
// after
var confirmationMatch = Regex.Match(email.HtmlMessage, "code: (.*?)(?:\\.|$)");
```

The old pattern took everything from `code: ` to the end of the message. With a sentence after the code, it would capture `<code>. If you didn't request...` and the reset would fail. The test had quietly treated the email body as an API.

Stopping at the first `.` is only safe if a code can never contain a `.`, so I checked. The Identity API encodes the code like this before sending it:

```csharp
code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(code));
```

Base64url ([RFC 4648 §5](https://www.rfc-editor.org/rfc/rfc4648#section-5)) uses only `A–Z`, `a–z`, `0–9`, `-` and `_`. No dot, so the lazy match ends exactly at the end of the code. If the encoding ever changed to standard Base64 (which has `+`, `/` and `=`), the test would still be fine. An encoding that allowed `.` would break it.

## Ripple effects

Templates get copied, and copies drift. The Blazor Identity scaffolder in dotnet/Scaffolding generates its own copy of `IdentityNoOpEmailSender`. [dotnet/Scaffolding#3797](https://github.com/dotnet/Scaffolding/issues/3797), the issue for aligning the scaffolder with the .NET 11 Blazor template, lists "Update `IdentityNoOpEmailSender` wording so recipients are told they can ignore confirmation and password-reset messages they did not request" and links back to #66747.

## What this doesn't change

If you implement `IEmailSender<TUser>` yourself, none of this reaches you. Your text is your own, and I'd suggest adding the same sentence. And of course a polite sentence doesn't stop anyone from requesting resets for addresses they don't own. Rate limiting and not revealing whether an account exists are separate problems that need separate controls.

## References

1. dotnet/aspnetcore issue [#66643](https://github.com/dotnet/aspnetcore/issues/66643): Improve default Identity email wording for recipients who didn't initiate the action.
2. dotnet/aspnetcore PR [#66747](https://github.com/dotnet/aspnetcore/pull/66747): Improve default Identity email wording for recipients who didn't initiate the action.
3. dotnet/Scaffolding issue [#3797](https://github.com/dotnet/Scaffolding/issues/3797): Update Blazor Identity scaffolder to align with the .NET 11 Blazor Web App template.
4. S. Josefsson, [RFC 4648: The Base16, Base32, and Base64 Data Encodings](https://www.rfc-editor.org/rfc/rfc4648), §5 Base 64 Encoding with URL and Filename Safe Alphabet, 2006.
5. OWASP, [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
