# Chrome Web Store — listing and forms

Text to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole). File to upload: `dist/markdown-coolreader-<version>.zip` (`npm run package`).

## Store listing tab

- **Name and short description**: taken from `_locales/en/messages.json`
- **Category**: Tools
- **Language**: English
- **Icon**: `icons/icon-128.png`
- **Screenshot** (1280×800): `store/screenshot-1280x800.png`
- **Small promo tile** (440×280): `store/promo-440x280.png`
- **Homepage**: https://github.com/Potatoe415/md-chrome-ext
- **Support**: https://github.com/Potatoe415/md-chrome-ext/issues

### Detailed description

```
Open a Markdown (.md) file in Chrome and read it formatted, instead of raw text.

• Left panel with every heading, following where you read
• Search the text (Ctrl+K), matches highlighted (F3)
• Reading settings: text size, width, font, light / dark / automatic theme
• Clean tables, task lists, code highlighting, front matter shown neatly
• Links to other .md files and Obsidian-style [[wikilinks]], images beside the file
• Edit right on the formatted page, then Ctrl+S saves the .md: what you don't touch stays the same, character for character
• Word (.docx) export and print / PDF

Files on your computer: after installing, turn on "Allow access to file URLs" in the extension's details (the extension's welcome page takes you there).
Files on websites (optional): allow websites from the extension's page to format .md files sent as plain text, such as raw files on GitHub.

Nothing leaves your computer: no account, no tracking, no server.
```

## Privacy practices tab

### Single purpose

```
Display Markdown (.md) files opened in Chrome formatted for reading, with navigation, search, editing and export, instead of raw text.
```

### Permission justifications

**scripting**
```
Adds the reader (scripts and styles packaged in the extension) to a tab only after its content script has confirmed the page is a plain-text Markdown file. Loading the reader on every matching address would break HTML pages whose address ends in .md.
```

**Host permission: file:///\***
```
Formats the Markdown files the user opens from their computer, the main purpose of the extension. The content script runs only on file addresses ending in .md, .markdown, .mdown, .mkd or .mdx, and does nothing unless the page is plain text.
```

**Optional host permissions: http://\*/\*, https://\*/\***
```
Optional, requested only when the user clicks "Allow websites" on the extension's page. Used to format Markdown files that websites serve as plain text (for example raw.githubusercontent.com). The content script is registered only for addresses ending in a Markdown extension and leaves the page alone unless it is plain text. No data is read from or sent to any site.
```

### Remote code

```
No, I am not using remote code. All scripts are packaged in the extension.
```

### Data usage

- Tick **no** collected data category.
- Tick the three certifications: no sale or transfer to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending.
- **Privacy policy URL**: https://github.com/Potatoe415/md-chrome-ext/blob/main/PRIVACY.md

## Before each upload

1. Raise `version` in `manifest.json` (the Store refuses a version already uploaded).
2. `npm install`, `npm test`, `npm run package`.
3. Upload the zip under "Package", then "Submit for review".
