(() => {
  'use strict';

  const MARKDOWN_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);

  if (!MARKDOWN_TYPES.has(document.contentType)) return;
  if (document.documentElement.classList.contains('mdv')) return;

  // Chrome affiche les fichiers texte sous la forme <body><pre>…</pre></body>.
  const pre = document.body?.querySelector(':scope > pre');
  if (!pre) return;

  const source = pre.textContent;
  const { frontMatter, body } = splitFrontMatter(source);

  const article = document.createElement('article');
  article.className = 'markdown-body';
  if (frontMatter) article.append(renderFrontMatter(frontMatter));
  article.append(renderMarkdown(body));

  const title = article.querySelector('h1')?.textContent.trim() || fileName();
  decorateHeadings(article);
  decorateCodeBlocks(article);

  const raw = document.createElement('pre');
  raw.className = 'mdv-raw';
  raw.hidden = true;
  raw.textContent = source;

  document.documentElement.classList.add('mdv');
  setupHead(title);
  document.body.replaceChildren(buildToolbar(article, raw), article, raw);
  scrollToHash();

  function splitFrontMatter(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (!match) return { frontMatter: null, body: text };
    return { frontMatter: match[1], body: text.slice(match[0].length) };
  }

  function renderFrontMatter(yaml) {
    const details = document.createElement('details');
    details.className = 'mdv-frontmatter';
    const summary = document.createElement('summary');
    summary.textContent = 'Front matter';
    const block = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-yaml';
    code.textContent = yaml;
    block.append(code);
    details.append(summary, block);
    return details;
  }

  function renderMarkdown(markdown) {
    const html = marked.parse(markdown, { gfm: true, async: false });
    return DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  }

  function slugify(text) {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
  }

  function decorateHeadings(root) {
    const seen = new Map();
    for (const heading of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const base = slugify(heading.textContent) || 'section';
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      heading.id = id;

      const anchor = document.createElement('a');
      anchor.className = 'mdv-anchor';
      anchor.href = `#${id}`;
      anchor.setAttribute('aria-hidden', 'true');
      anchor.tabIndex = -1;
      anchor.textContent = '#';
      heading.prepend(anchor);
    }
  }

  function decorateCodeBlocks(root) {
    for (const code of root.querySelectorAll('pre > code')) {
      const lang = /\blanguage-([\w+#.-]+)/.exec(code.className)?.[1];
      if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mdv-copy';
      button.textContent = 'Copier';
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          button.textContent = 'Copié ✓';
        } catch {
          button.textContent = 'Échec';
        }
        setTimeout(() => { button.textContent = 'Copier'; }, 1500);
      });
      code.parentElement.append(button);
    }
  }

  function buildToolbar(rendered, rawView) {
    const bar = document.createElement('div');
    bar.className = 'mdv-toolbar';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = 'Source';
    toggle.title = 'Basculer entre le rendu et le Markdown brut';
    toggle.addEventListener('click', () => {
      const showRaw = rawView.hidden;
      rawView.hidden = !showRaw;
      rendered.hidden = showRaw;
      toggle.textContent = showRaw ? 'Rendu' : 'Source';
    });

    bar.append(toggle);
    return bar;
  }

  function setupHead(pageTitle) {
    const head = document.head ?? document.documentElement.insertBefore(
      document.createElement('head'),
      document.body,
    );
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    head.append(viewport);
    document.title = pageTitle;
  }

  function fileName() {
    const last = location.pathname.split('/').pop() || location.href;
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  }

  function scrollToHash() {
    if (!location.hash) return;
    const hash = location.hash.slice(1);
    let id = hash;
    try {
      id = decodeURIComponent(hash);
    } catch {}
    document.getElementById(id)?.scrollIntoView();
  }
})();
