---
title: Example
tags: [demo, test]
---

# Main title

A paragraph with **bold**, *italic*, ~~strikethrough~~, `inline code` and an [internal link](#table).

See [the other file](other.md#next) or [[other|the wikilink]].

![Logo](logo.svg)

## Task list

- [x] Done
- [ ] To do
  - Sub-item

## Code

```js
// comment
function hello(name) {
  return `Hello ${name}`;
}
```

## Table

| Column | Value |
| :----- | ----: |
| a      |     1 |
| b      |     2 |

> Quote

<script>document.title = 'XSS'</script>
<img src="x" onerror="document.body.dataset.xss = '1'">
<iframe srcdoc="<script>parent.document.body.dataset.xss = '2'</script>"></iframe>

## Main title
