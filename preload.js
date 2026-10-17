'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('k9', {
  isDesktop: true,
  getPrefs: () => ipcRenderer.invoke('k9:get-prefs'),
  setPrefs: (patch) => ipcRenderer.invoke('k9:set-prefs', patch),
  call: (payload) => ipcRenderer.invoke('k9:call', payload),
  test: (s) => ipcRenderer.invoke('k9:test', s),
  copy: (text) => ipcRenderer.invoke('k9:copy', text),
  bridgeScript: () => ipcRenderer.invoke('k9:bridge-script'),
  version: () => ipcRenderer.invoke('k9:version'),
  zoom: (factor) => ipcRenderer.invoke('k9:zoom', factor),
  focus: () => ipcRenderer.invoke('k9:focus'),
  photo: (id) => ipcRenderer.invoke('k9:photo', id),
  pdf: (doc) => ipcRenderer.invoke('k9:pdf', doc),
  imagesPdf: (images) => ipcRenderer.invoke('k9:images-pdf', images),
  docOpen: (doc) => ipcRenderer.invoke('k9:doc-open', doc),
  docForget: (id) => ipcRenderer.invoke('k9:doc-forget', id),
  docPrune: (keep) => ipcRenderer.invoke('k9:doc-prune', keep),
  getUpdateState: () => ipcRenderer.invoke('k9:update-state'),
  updateCheck: () => ipcRenderer.invoke('k9:update-check'),
  updateInstall: () => ipcRenderer.invoke('k9:update-install'),
  onUpdate: (cb) => { ipcRenderer.on('k9:update', (_e, state) => cb(state)); },
  onSerialPorts: (cb) => { ipcRenderer.on('k9:serial-ports', (_e, list) => cb(list)); },
  serialChoose: (portId) => ipcRenderer.invoke('k9:serial-choose', portId),
});
