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
    automation: {
      impose: (payload: {
        jobId: string;
        inputPdf: string;
        baseUrl?: string;
        token?: string;
        sheetWMm?: number;
        sheetHMm?: number;
        gapMm?: number;
        marginTopMm?: number;
        marginRightMm?: number;
        marginBottomMm?: number;
        marginLeftMm?: number;
        rotation?: "auto" | "0" | "90";
      }) => Promise<{
        success: boolean;
        exitCode: number;
        error?: string;
        result?: {
          grid?: { cols?: number; rows?: number; units?: number; rotationDeg?: number };
          outputPath?: string;
          checksum?: string;
          durationMs?: number;
        } | null;
      }>;
      pickArt: () => Promise<string | null>;
    };
    imposition?: {
      open: (payload: unknown) => Promise<{ success: boolean; mode?: string; error?: string }>;
      sendLiveData: (payload: unknown) => Promise<{ success: boolean; mode?: string; error?: string }>;
    };
  };
}