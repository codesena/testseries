/** Convert JSON-escaped LaTeX that contains doubled backslashes to MathJax source. */
export function normalizeLatexSource(value: string): string {
    return value.replace(/\\\\/g, "\\");
}

export function inlineLatexSource(value: string): string {
    return normalizeLatexSource(value)
        .replace(/\$\$/g, "")
        .replace(/\$/g, "")
        .replace(/\\\(/g, "")
        .replace(/\\\)/g, "");
}
