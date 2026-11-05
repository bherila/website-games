// oxlint has no `no-restricted-syntax`; this local JS plugin reimplements it with the same
// options shape as ESLint core: ["error", "Selector" | { selector, message }, ...].
const rule = {
  meta: { schema: { type: 'array', items: {} } },
  create(context) {
    const visitors = {};
    for (const option of context.options) {
      const { selector, message } = typeof option === 'string' ? { selector: option } : option;
      const text = message ?? `Using '${selector}' is not allowed.`;
      const previous = visitors[selector];
      visitors[selector] = (node) => {
        if (previous) previous(node);
        context.report({ node, message: text });
      };
    }
    return visitors;
  },
};

export default {
  meta: { name: 'restricted-syntax' },
  rules: { 'no-restricted-syntax': rule },
};
