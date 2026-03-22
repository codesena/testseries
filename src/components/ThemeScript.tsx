export function ThemeScript() {
    // Runs before hydration to avoid theme flash.
    const code = `(() => {
    try {
      const t = localStorage.getItem('theme');
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
    } catch {}
  })();`;

    return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
