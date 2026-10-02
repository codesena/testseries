/** Convert JSON-escaped LaTeX that contains doubled backslashes to MathJax source. */
export function normalizeLatexSource(value: string): string {
    return value.replace(/\\\\/g, "\\");
}
