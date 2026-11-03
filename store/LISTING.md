# Chrome Web Store — listing and forms

Everything to enter in the [developer dashboard](https://chrome.google.com/webstore/devconsole).
Package: `dist/markdown-coolreader-<version>.zip` (`npm run package`). Images: `npm run assets`.

## Store listing

**Title and summary**: read from the package (`_locales/en/messages.json`).

**Description**

```
Markdown CoolReader turns Markdown files into clean, readable documents the moment you open them in Chrome. No app to install, no account, nothing to configure: open a .md file and read it.

READ COMFORTABLY
• Clear typography for headings, lists, quotes, tables and code
• A headings panel on the left that follows where you are, and folds away when you need room
• Syntax highlighting for code blocks
• Task lists with checkboxes, numeric table columns aligned, front matter shown as tidy tags

MAKE IT YOURS
• Light, dark or automatic theme
• Text size, column width and a sans or serif font, remembered for next time

FIND AND NAVIGATE
• Search the document with Ctrl+K; F3 steps through every match
• Links to other .md files open them, formatted as well
• Obsidian-style [[wikilinks]] and images stored next to the file work as they are

EDIT AND EXPORT
• Edit right on the formatted page, with only what Markdown can write
• Save the .md with Ctrl+S: whatever you did not touch is kept exactly as it was
• Export to Word (.docx), to a self-contained web page (.html), or print to PDF

GETTING STARTED
1. Install the extension. Its welcome page opens.
2. To read files from your computer, turn on "Allow access to file URLs" in the extension's details. The welcome page takes you there in one click.
3. Drag a .md file into Chrome, or press Ctrl+O and pick one.

Optional: allow websites from the welcome page to also format .md files that sites serve as plain text, such as raw files on GitHub. Regular web pages are never changed.

PRIVACY
Everything happens in your browser. Markdown CoolReader has no server, no account, no analytics and no ads, and it does not collect or send any data. Only your reading preferences are stored, on your device.

Supported files: .md, .markdown, .mdown, .mkd, .mdx
```

- **Category**: Developer Tools (where Markdown viewers are found; Tools also fits)
- **Language**: English

**Graphic assets**

| Field | File |
|---|---|
| Store icon, 128×128 | `icons/icon-128.png` |
| Screenshots, 1280×800 (in this order) | `store/screenshot-1-read.jpg`, `store/screenshot-2-before-after.jpg`, `store/screenshot-3-dark.jpg`, `store/screenshot-4-search.jpg`, `store/screenshot-5-edit.jpg` |
| Small promo tile, 440×280 | `store/promo-440x280.jpg` |
| Marquee promo tile, 1400×560 | `store/marquee-1400x560.jpg` |
| Promo video | none |

Put the screenshots under **Global screenshots** (one language only, so localized ones are not needed).

**Additional fields**

- **Official URL**: None
- **Homepage URL**: https://github.com/Potatoe415/md-chrome-ext
- **Support URL**: https://github.com/Potatoe415/md-chrome-ext/issues
- **Mature content**: off
- **Item support**: off (support goes through the Support URL)

## Privacy practices

**Single purpose**

```
Display Markdown (.md) files opened in Chrome formatted for reading, with navigation, search, editing and export, instead of raw text.
```

**scripting**

```
Adds the reader (scripts and styles packaged in the extension) to a tab only after its content script has confirmed the page is a plain-text Markdown file. Loading the reader on every matching address would break HTML pages whose address ends in .md. The HTML export also uses it to read the images of a local document: each image is opened in a background tab, read there and the tab is closed, because Chrome does not let extensions fetch local files.
```

**Host permissions**

```
file:///* formats the Markdown files the user opens from their computer, the main purpose of the extension. The content script runs only on file addresses ending in .md, .markdown, .mdown, .mkd or .mdx, and does nothing unless the page is plain text.

http://*/* and https://*/* are optional, requested only when the user clicks "Allow websites" on the extension's page. They are used to format Markdown files that websites serve as plain text (for example raw.githubusercontent.com). The content script is then registered only for addresses ending in a Markdown extension and leaves the page alone unless it is plain text. No data is read from or sent to any site.
```

**Remote code**: No, I am not using remote code.

**Data usage**: tick no data type; tick the three certifications.

**Privacy policy**: https://github.com/Potatoe415/md-chrome-ext/blob/main/PRIVACY.md

## Distribution

Free of charge · Public · All regions

## Test instructions

```
1. Install the extension. Its welcome page opens and shows whether "Allow access to file URLs" is on.
2. Local files: in chrome://extensions > Markdown CoolReader > Details, turn on "Allow access to file URLs". Download https://raw.githubusercontent.com/Potatoe415/md-chrome-ext/main/store/handbook.md and open it from disk (drag it into Chrome or press Ctrl+O): it shows formatted, with the headings panel on the left. Try Ctrl+K, the Aa menu, the pencil (edit) and the Word / HTML export buttons.
3. Websites (optional permission): click the extension's toolbar icon, then "Allow websites" and accept. Open https://raw.githubusercontent.com/Potatoe415/md-chrome-ext/main/store/handbook.md: it shows formatted.
4. HTML pages whose address ends in .md (for example https://github.com/Potatoe415/md-chrome-ext/blob/main/PRIVACY.md) are left untouched.
No account or login is needed.
```

## Before each upload

1. Raise `version` in `manifest.json` (the Store refuses a version already uploaded).
2. `npm install`, `npm test`, `npm run package`.
3. Upload the zip under "Package", then "Submit for review".
