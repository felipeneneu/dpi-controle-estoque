interface Window {
  grafica?: {
    info: () => Promise<{
      packaged: boolean;
      mode: "server" | "client";
      backendDir: string;
      outDir: string;
      version: string;
      electron: string;
      platform: string;
    }>;
    net: () => Promise<{ hostname: string; ips: { name: string; address: string }[] }>;
    quit: () => Promise<void>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    discover: () => Promise<{ name: string; ip: string; port: number } | null>;
    isFullScreen: () => Promise<boolean>;
    setFullScreen: (flag: boolean) => Promise<void>;
    isMaximized: () => Promise<boolean>;
    zoom: (payload: { delta?: number; level?: number }) => Promise<void>;
    onWindowState: (
      callback: (state: { isFullScreen: boolean; isMaximized: boolean }) => void
    ) => () => void;
  };
}