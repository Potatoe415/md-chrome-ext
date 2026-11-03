'use strict';

const WEB = { origins: ['http://*/*', 'https://*/*'] };
const $ = (id) => document.getElementById(id);

function pill(el, on) {
  el.textContent = on ? 'On' : 'Off';
  el.classList.toggle('on', on);
}

async function refresh() {
  const files = await chrome.extension.isAllowedFileSchemeAccess();
  pill($('fileState'), files);
  $('fileHelp').hidden = files;

  const web = await chrome.permissions.contains(WEB);
  pill($('webState'), web);
  $('webBtn').textContent = web ? 'Remove website access' : 'Allow websites';
  $('webBtn').dataset.on = String(web);
}

$('openDetails').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

$('webBtn').addEventListener('click', async () => {
  if ($('webBtn').dataset.on === 'true') await chrome.permissions.remove(WEB);
  else await chrome.permissions.request(WEB);
  refresh();
});

chrome.permissions.onAdded.addListener(refresh);
chrome.permissions.onRemoved.addListener(refresh);
refresh();
