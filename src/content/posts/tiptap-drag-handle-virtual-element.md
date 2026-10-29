---
title: "Typed, documented, ignored: forwarding getReferencedVirtualElement in Tiptap's React drag handle"
description: "The React DragHandle component in Tiptap accepted a getReferencedVirtualElement prop, the docs described it, and it did nothing, because the component never passed it to the plugin. Notes on PR #7832: a three-line fix, why TypeScript couldn't catch it, and the useEffect dependency that comes with it."
pubDatetime: 2026-10-22T09:00:00Z
repo: tiptap
pr: 7832
tags:
  - tiptap
  - react
  - typescript
---

This is the smallest of my merged PRs: three added lines in [ueberdosis/tiptap#7832](https://github.com/ueberdosis/tiptap/pull/7832), merged on 15 May 2026 and published in `@tiptap/extension-drag-handle-react` 3.23.5. I'm writing it up anyway, because the kind of bug it fixes is common in any library that wraps one implementation for several frameworks, and nothing in the toolchain catches it.

## Table of contents

## What the option is for

[Tiptap](https://tiptap.dev) is a headless rich-text editor built on ProseMirror. Its drag handle extension shows a grip next to the block you're hovering, so you can drag paragraphs and other blocks around. The grip is positioned with Floating UI's `computePosition`, using the hovered block's DOM element as the reference:

```ts
function repositionDragHandle(dom: Element) {
  const virtualElement = getReferencedVirtualElement?.() || {
    getBoundingClientRect: () => dom.getBoundingClientRect(),
  };

  computePosition(virtualElement, element, computePositionConfig).then(val => {
    // ...apply val.x / val.y
  });
}
```

`getReferencedVirtualElement` lets you replace that reference with a Floating UI virtual element, which is any object with a `getBoundingClientRect()`. That's useful when the handle should line up with something other than the block's own box, such as a gutter or a custom node view.

## The bug

Issue [#7748](https://github.com/ueberdosis/tiptap/issues/7748), from [@jbt](https://github.com/jbt) against 3.21.0, was short. The React `<DragHandle>` component had the prop in its `DragHandleProps` type, the [React drag handle docs](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react#getreferencedvirtualelement) described it, and passing it had no effect.

The framework-agnostic extension did forward it:

```ts
// packages/extension-drag-handle/src/drag-handle.ts
DragHandlePlugin({
  // ...
  getReferencedVirtualElement: this.options.getReferencedVirtualElement,
  // ...
});
```

The React component built the same plugin from its props, and this one option was missing from the list. Two wrappers around one plugin had drifted apart.

## The fix

Destructure the prop, pass it to the plugin, and add it to the effect's dependencies:

```tsx
const {
  // ...
  onElementDragEnd,
  getReferencedVirtualElement,
  computePositionConfig = defaultComputePositionConfig,
  nested = false,
} = props;

useEffect(() => {
  // ...
  const { plugin, unbind } = DragHandlePlugin({
    editor,
    element,
    pluginKey,
    // ...
    onNodeChange,
    getReferencedVirtualElement,
    nestedOptions,
  });

  editor.registerPlugin(plugin);
  return () => {
    if (!editor.isDestroyed) {
      editor.unregisterPlugin(pluginKey);
    }
    unbind();
  };
}, [
  element,
  editor,
  onNodeChange,
  getReferencedVirtualElement,
  pluginKey /* ... */,
]);
```

Plus a changeset marking `@tiptap/extension-drag-handle-react` for a patch release. To confirm it shipped, I unpacked the published packages from npm and searched the built `dist/index.js` for the option name:

```text
3.23.4 : 0 occurrences
3.23.5 : 3 occurrences
```

The three occurrences are the destructure, the plugin argument and the dependency.

## Why TypeScript didn't catch it

The prop was declared, typed and documented. The code still compiled, because TypeScript doesn't complain when you leave a property out of a destructuring pattern. An unused prop isn't an error. The type said "this component accepts the option", and nothing could check the claim that it also used it.

That's the general shape of this bug. When a wrapper lists the options it forwards one by one, every new option on the underlying plugin has to be added in several places: the type, the destructure, the call, and sometimes the dependency array. Missing one of them is silent. A test that renders the React component with every option set and checks what the plugin received would catch it. My PR didn't add one, and it would be a good follow-up.

## The dependency array

Adding the function to the `useEffect` dependencies is the correct thing to do in React, and it's also how the other callback props (`onNodeChange`, `onElementDragStart`, `onElementDragEnd`) were already handled. It has a consequence worth knowing about. When the function's identity changes, the effect runs again: the plugin is unregistered and a new one is registered.

If you write the function inline, it's a new function on every render:

```tsx
// re-registers the drag handle plugin on every render
<DragHandle editor={editor} getReferencedVirtualElement={() => myVirtualElement()}>
```

Keep it stable with `useCallback` instead:

```tsx
const getReferencedVirtualElement = useCallback(() => {
  const rect = editor.view.dom.getBoundingClientRect()
  const { top, bottom } = editor.view.coordsAtPos(editor.state.selection.from)
  // a contrived example: pin the handle to the editor's left edge,
  // level with the current selection
  return { getBoundingClientRect: () => new DOMRect(rect.left, top, 0, bottom - top) }
}, [editor])

<DragHandle editor={editor} getReferencedVirtualElement={getReferencedVirtualElement}>
```

The alternative inside the component would be to keep the latest callback in a ref and leave it out of the dependencies. That avoids re-registering the plugin, but it would have changed how all the callback props behave, which is much more than a forwarding fix should do.

## References

1. ueberdosis/tiptap issue [#7748](https://github.com/ueberdosis/tiptap/issues/7748): React DragHandle component ignores getReferencedVirtualElement.
2. ueberdosis/tiptap PR [#7832](https://github.com/ueberdosis/tiptap/pull/7832): fix(drag-handle-react): forward getReferencedVirtualElement to plugin.
3. Tiptap docs, [Drag Handle React extension](https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react).
4. Floating UI docs, [Virtual elements](https://floating-ui.com/docs/virtual-elements).
5. React docs, [useCallback](https://react.dev/reference/react/useCallback).
