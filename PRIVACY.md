# Privacy policy — Markdown CoolReader

_Last updated: November 3, 2026_

Markdown CoolReader is a Chrome extension that displays Markdown (`.md`) files formatted for reading.

## What the extension does with your data

- **It collects nothing.** No personal data, no browsing history, no analytics, no account.
- **It sends nothing.** The extension has no server and makes no network request of its own. The Markdown file is read and formatted inside the browser tab where you opened it.
- **What stays on your device:** your reading settings (text size, width, font, theme) are saved in the browser's local storage so they apply next time. Nothing else is stored.
- **Saving and exports** (edited `.md` file, Word document, PDF) are written only to the place you choose on your computer.

## Permissions

- **Access to file URLs** (`file:///*`), which you turn on yourself: to format the `.md` files you open from your computer.
- **Websites** (`http://*/*`, `https://*/*`), optional and off until you allow them on the extension's page: to format `.md` files that websites send as plain text. Only pages whose address ends in `.md` (or `.markdown`, `.mdown`, `.mkd`, `.mdx`) and whose content is plain text are changed; other pages are left untouched.
- **Scripting**: to add the reader to those Markdown pages.

Images and links written in a document load from their own address, as in any web page. When you export to HTML, the document's images are read again to be included in the file: images on your computer through a background tab that closes right away, images on the web from their own address. The extension makes no other request.

## Contact

Questions: open an issue on [github.com/Potatoe415/md-chrome-ext](https://github.com/Potatoe415/md-chrome-ext/issues).
