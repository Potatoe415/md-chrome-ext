---
title: Project guide
tags: [documentation, markdown]
author: Product team
---

# Project guide

This file is opened straight in Chrome: it shows **formatted**, with a headings panel on the left, search (`Ctrl+K`), dark mode and Word export.

## Installation

1. Clone the repository
2. Install the dependencies
3. Start the development server

```bash
git clone https://github.com/example/project.git
npm install
npm run dev
```

## Configuration

| Variable      | Default | Purpose               |
| :------------ | ------: | :-------------------- |
| `PORT`        |    3000 | Server port           |
| `CACHE_TTL`   |     600 | Cache lifetime (s)    |
| `MAX_UPLOADS` |      20 | Files per request     |

## Progress

- [x] Read local files
- [x] Headings panel and search
- [ ] Translate the documentation

> Tip: the pencil button edits the text right on the page, then `Ctrl+S` saves the `.md` file.

## Code sample

```ts
export function greet(name: string): string {
  return `Hello ${name}!`;
}
```

## Going further

See the release notes and the FAQ for details.
