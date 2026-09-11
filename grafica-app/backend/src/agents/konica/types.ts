export interface KonicaTonerColor {
  cyan?: number;
  magenta?: number;
  yellow?: number;
  black?: number;
}

export interface KonicaJob {
  jobName: string;
  paperName: string;
  mediaLabel: string;
  osNumber: string | null;
  gram: number | null;
  pages: number;
  sheets: number;
  pagesPrinted: number;
  copies: number;
  colorMode: string;
  status: string;
  printEndDate: string;
  tonerByColor?: KonicaTonerColor;
  rawData: unknown;
}

export type FetchResult =
  | { ok: true; raw: unknown }
  | { ok: false; reason: 'auth' | 'offline' | 'error'; status?: number };