/** Build a regex fragment that matches a CSS selector ignoring formatter whitespace. */
export function cssSelectorPattern(selector: string): string {
  return selector
    .trim()
    .split(/\s*,\s*/)
    .map((part) =>
      part
        .trim()
        .split(/(\s*[>+~]\s*)/)
        .map((token) => {
          const combinator = /^\s*([>+~])\s*$/.exec(token);
          if (combinator) {
            const op = combinator[1] === "+" ? "\\+" : combinator[1];
            return `\\s*${op}\\s*`;
          }
          return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        })
        .join(""),
    )
    .join("\\s*,\\s*");
}

export function declarationsIn(styles: string, selector: string): string {
  return new RegExp(`${cssSelectorPattern(selector)}\\s*\\{([^}]*)\\}`).exec(styles)?.[1] ?? "";
}
