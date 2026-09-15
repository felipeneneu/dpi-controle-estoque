import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export const PT_PER_MM = 72 / 25.4; // ~2.83465 pt por mm

export const SHEET_WIDTH_MM = 330;
export const SHEET_HEIGHT_MM = 480;
export const MARGIN_MM = 5;
export const GAP_MM = 3;
export const LABEL_WIDTH_MM = 90;
export const LABEL_HEIGHT_MM = 35;

export interface LabelItem {
  id: string;
  type: 'bobina' | 'tinta';
  code: string;
  title: string;
  subtitle?: string;
  details?: string;
  qrPayload: string;
}

export interface CellPosition {
  index: number;
  col: number;
  row: number;
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

export interface ImpositionLayout {
  rotation: 0 | 90;
  cols: number;
  rows: number;
  capacity: number;
  cellWidthPt: number;
  cellHeightPt: number;
  cells: CellPosition[];
}

/**
 * Calcula a grade geométrica de imposição na folha 330x480mm da Konica
 * Dimensão padrão da etiqueta: 90x35mm
 * - Horizontal (0°): 3 colunas x 12 linhas = 36 etiquetas
 * - Vertical (90°): 8 colunas x 5 linhas = 40 etiquetas (+11% de aproveitamento)
 */
export function getImpositionLayout(
  rotation: 0 | 90,
  customMarginMm: number = MARGIN_MM,
  customGapMm: number = GAP_MM
): ImpositionLayout {
  const sheetHeightPt = SHEET_HEIGHT_MM * PT_PER_MM;
  const marginPt = customMarginMm * PT_PER_MM;
  const gapPt = customGapMm * PT_PER_MM;

  if (rotation === 0) {
    // 0° (Horizontal): etiqueta 90x35mm
    // 3 colunas x 12 linhas = 36 etiquetas/folha
    const cols = 3;
    const rows = 12;
    const cellWidthPt = LABEL_WIDTH_MM * PT_PER_MM; // 90mm
    const cellHeightPt = LABEL_HEIGHT_MM * PT_PER_MM; // 35mm
    const cells: CellPosition[] = [];

    let index = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const xPt = marginPt + c * (cellWidthPt + gapPt);
        const topYPt = sheetHeightPt - marginPt - r * (cellHeightPt + gapPt);
        const yPt = topYPt - cellHeightPt;

        cells.push({
          index,
          col: c,
          row: r,
          xPt,
          yPt,
          widthPt: cellWidthPt,
          heightPt: cellHeightPt,
        });
        index++;
      }
    }

    return {
      rotation: 0,
      cols,
      rows,
      capacity: cols * rows,
      cellWidthPt,
      cellHeightPt,
      cells,
    };
  } else {
    // 90° (Vertical): etiqueta 35x90mm
    // 8 colunas x 5 linhas = 40 etiquetas/folha
    const cols = 8;
    const rows = 5;
    const cellWidthPt = LABEL_HEIGHT_MM * PT_PER_MM; // 35mm na largura da folha
    const cellHeightPt = LABEL_WIDTH_MM * PT_PER_MM; // 90mm na altura da folha
    const cells: CellPosition[] = [];

    let index = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const xPt = marginPt + c * (cellWidthPt + gapPt);
        const topYPt = sheetHeightPt - marginPt - r * (cellHeightPt + gapPt);
        const yPt = topYPt - cellHeightPt;

        cells.push({
          index,
          col: c,
          row: r,
          xPt,
          yPt,
          widthPt: cellWidthPt,
          heightPt: cellHeightPt,
        });
        index++;
      }
    }

    return {
      rotation: 90,
      cols,
      rows,
      capacity: cols * rows,
      cellWidthPt,
      cellHeightPt,
      cells,
    };
  }
}

/**
 * Gera o documento PDF SRA3 (330x480mm) pronto para impressão com corte na Konica
 */
export async function generateImpositionPdf(
  items: (LabelItem | null)[],
  options: { rotation?: 0 | 90; marginMm?: number; gapMm?: number } = {}
): Promise<Uint8Array> {
  const rotation = options.rotation ?? 90;
  const marginMm = options.marginMm ?? MARGIN_MM;
  const gapMm = options.gapMm ?? GAP_MM;

  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const sheetWidthPt = SHEET_WIDTH_MM * PT_PER_MM;
  const sheetHeightPt = SHEET_HEIGHT_MM * PT_PER_MM;

  const layout = getImpositionLayout(rotation, marginMm, gapMm);
  const capacity = layout.capacity;
  const totalPages = Math.max(1, Math.ceil(items.length / capacity));

  const qrSizePt = 24 * PT_PER_MM; // 24mm x 24mm

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = doc.addPage([sheetWidthPt, sheetHeightPt]);
    const startIndex = pageIdx * capacity;
    const pageItems = items.slice(startIndex, startIndex + capacity);

    for (let i = 0; i < pageItems.length; i++) {
      const item = pageItems[i];
      if (!item) continue; // Pula slots vazios (preserva folha virgem)

      const cell = layout.cells[i];

      // Gera o PNG do QR Code
      const qrDataUrl = await QRCode.toDataURL(item.qrPayload, {
        margin: 0,
        errorCorrectionLevel: 'M',
        width: 256,
      });
      const qrImageBytes = Uint8Array.from(atob(qrDataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const qrImage = await doc.embedPng(qrImageBytes);

      // Desenha o contorno preto de 1pt da etiqueta (guia de corte)
      page.drawRectangle({
        x: cell.xPt,
        y: cell.yPt,
        width: cell.widthPt,
        height: cell.heightPt,
        borderWidth: 1,
        borderColor: rgb(0, 0, 0),
        color: rgb(1, 1, 1),
      });

      const cleanCode = item.code.startsWith('#') ? item.code : `#${item.code}`;
      const title = item.title.length > 25 ? `${item.title.substring(0, 23)}...` : item.title;
      const subtitle = item.subtitle || '';
      const details = item.details || '';

      if (rotation === 0) {
        // Modo 0° (Horizontal: 90x35mm)
        // QR Code à esquerda
        page.drawImage(qrImage, {
          x: cell.xPt + 4.5 * PT_PER_MM,
          y: cell.yPt + 5.5 * PT_PER_MM,
          width: qrSizePt,
          height: qrSizePt,
        });

        // Linha 1: Código Curto (#1042)
        page.drawText(cleanCode, {
          x: cell.xPt + 31 * PT_PER_MM,
          y: cell.yPt + 23 * PT_PER_MM,
          size: 15,
          font: fontBold,
          color: rgb(0, 0, 0),
        });

        // Linha 2: Descrição / Nome
        page.drawText(title, {
          x: cell.xPt + 31 * PT_PER_MM,
          y: cell.yPt + 15 * PT_PER_MM,
          size: 9,
          font: fontBold,
          color: rgb(0.15, 0.15, 0.15),
        });

        // Linha 3: Subtítulo (Largura / Cor / Subtipo)
        if (subtitle) {
          page.drawText(subtitle, {
            x: cell.xPt + 31 * PT_PER_MM,
            y: cell.yPt + 9 * PT_PER_MM,
            size: 7.5,
            font: fontRegular,
            color: rgb(0.35, 0.35, 0.35),
          });
        }

        // Linha 4: Detalhes adicionais (Metragem / Lote)
        if (details) {
          page.drawText(details, {
            x: cell.xPt + 31 * PT_PER_MM,
            y: cell.yPt + 3.5 * PT_PER_MM,
            size: 6.8,
            font: fontRegular,
            color: rgb(0.45, 0.45, 0.45),
          });
        }
      } else {
        // Modo 90° (Vertical: 35x90mm)
        const cellTopY = cell.yPt + cell.heightPt;

        // QR Code no topo da célula vertical
        page.drawImage(qrImage, {
          x: cell.xPt + 4.5 * PT_PER_MM + qrSizePt,
          y: cellTopY - 4.5 * PT_PER_MM,
          width: qrSizePt,
          height: qrSizePt,
          rotate: degrees(-90),
        });

        // Linha 1: Código Curto (#1042)
        page.drawText(cleanCode, {
          x: cell.xPt + (35 - 12) * PT_PER_MM,
          y: cellTopY - 31 * PT_PER_MM,
          size: 15,
          font: fontBold,
          color: rgb(0, 0, 0),
          rotate: degrees(-90),
        });

        // Linha 2: Descrição / Nome
        page.drawText(title, {
          x: cell.xPt + (35 - 20) * PT_PER_MM,
          y: cellTopY - 31 * PT_PER_MM,
          size: 9,
          font: fontBold,
          color: rgb(0.15, 0.15, 0.15),
          rotate: degrees(-90),
        });

        // Linha 3: Subtítulo
        if (subtitle) {
          page.drawText(subtitle, {
            x: cell.xPt + (35 - 26) * PT_PER_MM,
            y: cellTopY - 31 * PT_PER_MM,
            size: 7.5,
            font: fontRegular,
            color: rgb(0.35, 0.35, 0.35),
            rotate: degrees(-90),
          });
        }

        // Linha 4: Detalhes
        if (details) {
          page.drawText(details, {
            x: cell.xPt + (35 - 31.5) * PT_PER_MM,
            y: cellTopY - 31 * PT_PER_MM,
            size: 6.8,
            font: fontRegular,
            color: rgb(0.45, 0.45, 0.45),
            rotate: degrees(-90),
          });
        }
      }
    }
  }

  return await doc.save();
}

/**
 * Dispara o download ou abertura de impressão do PDF no navegador
 */
export function openPdfInBrowser(pdfBytes: Uint8Array, filename = 'imposicao-etiquetas-konica.pdf') {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  try {
    const win = window.open(url, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
