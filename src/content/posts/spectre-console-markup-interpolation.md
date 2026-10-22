---
title: "List`1[System.Int32] is not a style: escaping interpolated values in Spectre.Console markup"
description: "MarkupInterpolated escaped string arguments but passed every other object through untouched, so anything whose ToString() contained square brackets crashed the markup parser. That includes List<int> and int[]. Notes on spectre.console PR #2118: the fix, the IFormattable trade-off, and what still breaks."
pubDatetime: 2026-10-22T12:00:00Z
repo: spectre-console
tags:
  - dotnet
  - spectre-console
  - csharp
---

[Spectre.Console](https://spectreconsole.net) uses square brackets for markup: `[red]error[/]` prints "error" in red. Any literal `[` in your text has to be escaped as `[[`, otherwise the parser tries to read it as a style.

`MarkupInterpolated` and `MarkupLineInterpolated` exist so you don't have to think about that for values you interpolate. You write `$"Hello {name}"` and the library escapes `name` for you. Issue [#1763](https://github.com/spectreconsole/spectre.console/issues/1763), opened by [@yaakov-h](https://github.com/yaakov-h), showed that this only worked when the value was a `string`. My fix is [#2118](https://github.com/spectreconsole/spectre.console/pull/2118), merged on 12 May 2026 and released in [0.56.0](https://github.com/spectreconsole/spectre.console/releases/tag/0.56.0).

## Table of contents

## The bug

The issue's repro is short:

```csharp
class CoolThing
{
    public override string ToString() => "This[contains, braces].";
}

AnsiConsole.MarkupLineInterpolated($"I have a {thing}");
// InvalidOperationException: Could not find color or style 'contains,'.
```

The detail I liked most in the report was the workaround. Calling `{thing.ToString()}` yourself avoids the crash, but the IDE then flags it with IDE0071, "simplify interpolation", because an explicit `ToString()` inside an interpolation hole is normally redundant. So the code the analyzer wants is the code that crashes.

## Where it came from

All the interpolated APIs go through one method:

```csharp
internal static string EscapeInterpolated(IFormatProvider provider, FormattableString value)
{
    object?[] args = value.GetArguments().Select(arg => arg is string s ? s.EscapeMarkup() : arg).ToArray();
    return string.Format(provider, value.Format, args);
}
```

Strings are escaped. Everything else is handed to `string.Format` as it is, which calls `ToString()` on it later, after escaping has already happened.

It doesn't take a contrived class to hit this. Plenty of ordinary .NET types have brackets in their default `ToString()`. I ran the same four calls against 0.55.0 and 0.56.0:

```csharp
var list = new List<int> { 1, 2, 3 };    // ToString(): System.Collections.Generic.List`1[System.Int32]
int[] array = [1, 2, 3];                 // ToString(): System.Int32[]
var thing = new CoolThing();             // ToString(): This[contains, braces].
var when = new DateTime(2026, 5, 12, 11, 9, 0);

console.MarkupInterpolated($"items: {list}");
console.MarkupInterpolated($"items: {array}");
console.MarkupInterpolated($"value: {thing}");
console.MarkupInterpolated($"at {when:[HH:mm]}");
```

```text
== 0.55.0
List<int>                    InvalidOperationException: Encountered malformed markup tag at position 54.
int[]                        InvalidOperationException: Encountered malformed markup tag at position 21.
custom ToString              InvalidOperationException: Could not find color or style 'contains,'.
DateTime with [..] format    InvalidOperationException: Encountered malformed markup tag at position 10.
== 0.56.0
List<int>                    ok
int[]                        ok
custom ToString              ok
DateTime with [..] format    InvalidOperationException: Encountered malformed markup tag at position 10.
```

The last line is intentional, and I'll come back to it.

## The fix

```csharp
internal static string EscapeInterpolated(IFormatProvider provider, FormattableString value)
{
    object?[] args = value.GetArguments()
        .Select(arg => arg switch
        {
            null => null,
            string text => text.EscapeMarkup(),
            IFormattable => arg,
            _ => arg.ToString()?.EscapeMarkup(),
        })
        .ToArray();
    return string.Format(provider, value.Format, args);
}
```

Each case is there for a reason:

- **`null` stays `null`.** Calling `ToString()` on it would throw, and turning it into an empty string early would hide it from a custom `ICustomFormatter` that wants to print something like `<null>`. There's a test for exactly that.
- **`string`** is escaped, as before.
- **`IFormattable`** is passed through untouched. This covers numbers, dates, `Guid`, `TimeSpan` and any type that understands format strings. If I converted these to strings early, `{price:C}` or `{date:yyyy-MM-dd}` would lose their format specifier, and culture-specific formatting through the provider would stop working. Their usual output doesn't contain brackets, so passing them through is the safe default.
- **Everything else** is converted with `ToString()` and escaped. That covers collections, arrays, records and your own classes.

## What this doesn't fix

The `IFormattable` exception has a cost, and the last line of the experiment shows it. If a format string itself produces brackets, as in `{when:[HH:mm]}`, the output still reaches the markup parser unescaped. Fixing that would mean formatting each `IFormattable` with its format string and provider, then escaping the result. That's possible, but `GetArguments()` doesn't give you the per-hole format string. You would have to parse `value.Format` yourself, which is a much bigger change than the issue asked for. I left it out deliberately, and I'd rather say so here than pretend the problem is gone.

If you need brackets from a format string, escape them in the format itself (`{when:[[HH:mm]]}`) or format the value first and pass the string.

## Tests

Two tests in `MarkupTests`:

- `MarkupInterpolated_Should_Not_Throw_When_Object_ToString_Contains_Brackets` uses the class from the issue and asserts both that nothing throws and that the output is exactly `This is a This[contains, braces].`. Checking the exact output matters: an escaping bug can also show up as doubled brackets, not just as a crash.
- `MarkupInterpolated_Should_Preserve_Null_For_Custom_Formatter` passes a formatter that prints `<null>` and checks that it still sees the `null`.

[@patriksvensson](https://github.com/patriksvensson) approved it with a "LGTM 👍". It was my second PR to the project, after [the Align measurement fix](/posts/spectre-console-align-measure/).

## References

1. spectreconsole/spectre.console issue [#1763](https://github.com/spectreconsole/spectre.console/issues/1763): Interpolation crashes if object contains square brackets.
2. spectreconsole/spectre.console PR [#2118](https://github.com/spectreconsole/spectre.console/pull/2118): Fix escaping of interpolated arguments in markup.
3. Spectre.Console [0.56.0 release notes](https://github.com/spectreconsole/spectre.console/releases/tag/0.56.0).
4. Spectre.Console docs, [Markup](https://spectreconsole.net/markup).
5. Microsoft Learn, [IDE0071: Simplify interpolation](https://learn.microsoft.com/dotnet/fundamentals/code-analysis/style-rules/ide0071).
