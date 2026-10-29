---
title: "Measure twice, render once: why Align.Width didn't shrink a Spectre.Console panel"
description: "Spectre.Console lays out widgets in two passes, measure and render. Align respected an explicit Width when rendering but not when measuring, so a Panel around it always stretched to the full console. Notes on my first spectre.console PR, #2101: the layout model, the fix, and two review comments that made it correct."
pubDatetime: 2026-10-22T11:00:00Z
repo: spectre-console
pr: 2101
tags:
  - dotnet
  - spectre-console
  - csharp
---

This was my first contribution to [Spectre.Console](https://github.com/spectreconsole/spectre.console): [PR #2101](https://github.com/spectreconsole/spectre.console/pull/2101), merged on 25 April 2026 and released in [0.56.0](https://github.com/spectreconsole/spectre.console/releases/tag/0.56.0), whose release notes include the line "@GrantTotinov made their first contribution". The fix is eight lines. Understanding why those eight lines were needed meant learning how Spectre.Console lays out widgets, and that's what this post is mostly about.

## Table of contents

## The symptom

Issue [#1910](https://github.com/spectreconsole/spectre.console/issues/1910), from [@LittleLittleCloud](https://github.com/LittleLittleCloud), describes it: put an `Align` with an explicit width inside a `Panel`, and the panel's border still stretches across the whole console.

```csharp
console.Profile.Width = 50;
console.Write(new Panel(Align.Left(new Text("Hello")).Width(20)));
```

Same code, before and after the fix:

```text
0.55.0
┌────────────────────────────────────────────────┐
│ Hello                                          │
└────────────────────────────────────────────────┘

0.56.0
┌──────────────────────┐
│ Hello                │
└──────────────────────┘
```

The second panel is 24 columns wide: 20 for the content, plus one column of padding and one of border on each side.

## Two passes: measure, then render

Every Spectre.Console widget is an `IRenderable` with two methods:

- `Measure(options, maxWidth)` returns a `Measurement(Min, Max)`: the narrowest the widget can be, and the widest it would like to be, within `maxWidth`.
- `Render(options, maxWidth)` produces the actual segments of text.

Containers like `Panel`, `Table` and `Columns` call `Measure` on their children first, decide how wide each child gets, and only then call `Render`. A panel that isn't set to expand sizes itself from its child's measurement.

The base class has a deliberately simple default:

```csharp
protected virtual Measurement Measure(RenderOptions options, int maxWidth)
{
    return new Measurement(maxWidth, maxWidth);
}
```

"I want all the space you have." That's a safe default for a widget that doesn't know better, and `Align` didn't override it. Its `Render` method used `Width` correctly, so the text was aligned inside a 20-column area. But when the panel asked how wide it should be, `Align` answered "50", and the panel drew its border at 50.

## The fix

```csharp
protected override Measurement Measure(RenderOptions options, int maxWidth)
{
    var width = Math.Min(Width ?? maxWidth, maxWidth);
    var measurement = _renderable.Measure(options with { Height = null }, width);
    return new Measurement(Math.Min(measurement.Min, width), width);
}
```

In words: the width I'll occupy is my explicit `Width`, if there is one, capped at what the parent can offer. Ask the child how it measures within that width. Report that width as my maximum, and the child's minimum as my minimum, but never more than my width.

The issue already sketched an override. The version that got merged differs in that last `Math.Min`, and that came from review.

## What review changed

The first review was automated, from Copilot, and it made two points that both changed the PR.

**The minimum has to be clamped too.** My first version returned `new Measurement(measurement.Min, width)`. The review pointed out that a child's `Min` can be larger than `width`. `Paragraph`, for example, doesn't clamp its minimum for unbreakable content, so a long word reports a minimum wider than the space it's given. A measurement where `Min > Max` makes no sense, and a `Table` or `Columns` reading it would reserve more space than the explicit `Width` allows, which defeats the point of setting it. Clamping `Min` keeps the measurement consistent: `Min <= Max == width`.

**The test has to exercise `Measure`, not `Render`.** My first test rendered `Align.Left(new Panel("Hello World!")).Width(20)` and checked the output. The review noted that this would pass without the fix, because `Align.Render` already respected `Width`. The bug only shows up when a parent measures the `Align`. The final test calls `Measure` directly:

```csharp
[Fact]
public void Should_Return_Explicit_Width_When_Set()
{
    // Given
    var console = new TestConsole().Size(new Size(40, 15));
    var align = Align.Left(new Panel("Hello World!")).Width(20);

    // When
    var measurement = ((IRenderable)align)
        .Measure(RenderOptions.Create(console), 40);

    // Then
    Assert.Equal(20, measurement.Max);
}
```

A test that passes with and without the fix doesn't test the fix. The cheapest check is to run a new test against the old code and watch it fail.

## The public API snapshot

Spectre.Console keeps a verified snapshot of its entire public API surface (`Public_API.Output.verified.txt`), and the build fails if the surface changes without the snapshot being updated. A new `protected override` counts as a public API change, because subclasses can see it. I hadn't updated the snapshot, so [@patriksvensson](https://github.com/patriksvensson) pushed a commit that did, then merged it with "Thank you for your contribution. Much appreciated! 👍". For a first PR to a project, that's about as smooth as it gets. It's still worth looking for snapshot tests like this before opening one.

## What I'd tell someone writing a Spectre.Console widget

- If your widget can be narrower than the space it's offered, override `Measure`. The default claims everything.
- Keep `Measure` and `Render` in agreement. If `Render` uses a width, `Measure` should report the same width.
- Keep `Min <= Max`, and clamp anything you get from a child.
- Test measurement directly, or through a parent that depends on it, like `Panel`, `Table` or `Columns`.

## References

1. spectreconsole/spectre.console issue [#1910](https://github.com/spectreconsole/spectre.console/issues/1910): Align Measure always return maxWidth even when I explicitly set Width.
2. spectreconsole/spectre.console PR [#2101](https://github.com/spectreconsole/spectre.console/pull/2101): Fix Align measure to respect explicitly set width.
3. Spectre.Console [0.56.0 release notes](https://github.com/spectreconsole/spectre.console/releases/tag/0.56.0).
4. Spectre.Console docs, [Align widget](https://spectreconsole.net/console/widgets/align/).
