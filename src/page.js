'use strict';
// The reader as a page of the extension (toolbar icon): files come from the picker, a drop or a paste, so
// it works without "Allow access to file URLs". The styles and scripts load in order, as in a tab.
for (const file of self.MDV_CSS) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `/${file}`;
  link.dataset.mdv = '';
  document.head.append(link);
}
for (const file of self.MDV_JS) {
  const script = document.createElement('script');
  script.src = `/${file}`;
  script.async = false;
  document.head.append(script);
}
