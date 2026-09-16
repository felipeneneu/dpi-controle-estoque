const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grafica', {
  info: () => ipcRenderer.invoke('grafica:info'),
  net: () => ipcRenderer.invoke('grafica:net'),
  quit: () => ipcRenderer.invoke('grafica:quit'),
  minimize: () => ipcRenderer.invoke('grafica:minimize'),
  maximize: () => ipcRenderer.invoke('grafica:maximize'),
  close: () => ipcRenderer.invoke('grafica:quit'),
  discover: () => ipcRenderer.invoke('grafica:discover'),
  isFullScreen: () => ipcRenderer.invoke('grafica:isFullScreen'),
  setFullScreen: (flag) => ipcRenderer.invoke('grafica:setFullScreen', flag),
  isMaximized: () => ipcRenderer.invoke('grafica:isMaximized'),
  zoom: (payload) => ipcRenderer.invoke('grafica:zoom', payload),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('grafica:window-state', listener);
    return () => ipcRenderer.removeListener('grafica:window-state', listener);
  },
  imposition: {
    open: (payload) => ipcRenderer.invoke('imposition:open', payload),
  },
  automation: {
    impose: (payload) => ipcRenderer.invoke('automation:impose', payload),
    pickArt: () => ipcRenderer.invoke('automation:pick-art'),
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});