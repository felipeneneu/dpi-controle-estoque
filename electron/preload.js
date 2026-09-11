const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grafica', {
  info: () => ipcRenderer.invoke('grafica:info'),
  net: () => ipcRenderer.invoke('grafica:net'),
  quit: () => ipcRenderer.invoke('grafica:quit'),
  discover: () => ipcRenderer.invoke('grafica:discover'),
});