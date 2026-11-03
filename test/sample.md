---
title: Exemple
tags: [demo, test]
---

# Titre principal

Paragraphe avec **gras**, *italique*, ~~barré~~, `code inline` et un [lien interne](#tableau).

Voir [l'autre fichier](other.md#suite) ou [[other|le wikilink]].

![Logo](logo.svg)

## Liste de tâches

- [x] Fait
- [ ] À faire
  - Sous-élément

## Code

```js
// commentaire
function hello(name) {
  return `Bonjour ${name}`;
}
```

## Tableau

| Colonne | Valeur |
| :------ | -----: |
| a       |      1 |
| b       |      2 |

> Citation

<script>document.title = 'XSS'</script>
<img src="x" onerror="document.body.dataset.xss = '1'">
<iframe srcdoc="<script>parent.document.body.dataset.xss = '2'</script>"></iframe>

## Titre principal
