/**
 * Rehype plugin that wraps every table in a `div.table-scroll`, so a table wider
 * than the article scrolls sideways instead of widening the page on phones.
 */
export const rehypeScrollTables = () => tree => {
  const wrap = node => {
    node.children?.forEach((child, index) => {
      if (child.type === "element" && child.tagName === "table") {
        node.children[index] = {
          type: "element",
          tagName: "div",
          properties: { className: ["table-scroll"] },
          children: [child],
        };
      } else {
        wrap(child);
      }
    });
  };
  wrap(tree);
};
