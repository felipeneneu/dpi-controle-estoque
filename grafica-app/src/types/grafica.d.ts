interface Window {
  grafica?: {
    info: () => Promise<{
      packaged: boolean;
      mode: "server" | "client";
      backendDir: string;
      outDir: string;
    }>;
    net: () => Promise<{ hostname: string; ips: { name: string; address: string }[] }>;
    quit: () => Promise<void>;
  };
}