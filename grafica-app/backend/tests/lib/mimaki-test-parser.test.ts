import { describe, it, expect } from 'vitest';
import { parsePrintCsv, extractFilenameMeta, extractBobinaSerial } from '../../src/lib/mimaki-test-parser.js';

const okCsv31180 = `KEY_FILENAME,KEY_RESULT,KEY_INKUSE,KEY_RIP_S_TIME,KEY_RIP_E_TIME,KEY_PRINT_S_TIME,KEY_PRINT_E_TIME,KEY_ARRANGE_CNT,KEY_RESULT_DETAIL
31180 - José Augusto - Vinil Adesivo Branco Brilho - 60x60 - 88un.pdf,OK,Cyan:1.277cc Magenta:1.062cc Yellow:0.928cc Black:0.984cc White:0.000cc White:0.000cc Clear:0.000cc Clear:0.000cc,20260915_145744,20260915_145808,20260915_145808,20260915_150513,1,
`;

const okCsv31153 = `KEY_FILENAME,KEY_RESULT,KEY_INKUSE,KEY_RIP_S_TIME,KEY_RIP_E_TIME,KEY_PRINT_S_TIME,KEY_PRINT_E_TIME,KEY_ARRANGE_CNT,KEY_RESULT_DETAIL
31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - BRANCO.pdf,OK,Cyan:0.624cc Magenta:0.716cc Yellow:0.784cc Black:0.004cc White:9.388cc White:9.388cc Clear:0.000cc Clear:0.000cc,20260915_091145,20260915_091203,20260915_091258,20260915_101344,4,
31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - COR.pdf,OK,Cyan:0.624cc Magenta:0.716cc Yellow:0.784cc Black:0.004cc White:9.388cc White:9.388cc Clear:0.000cc Clear:0.000cc,20260915_091204,20260915_091220,20260915_091258,20260915_101344,4,
`;

const ngCsv31153 = `KEY_FILENAME,KEY_RESULT,KEY_INKUSE,KEY_RIP_S_TIME,KEY_RIP_E_TIME,KEY_PRINT_S_TIME,KEY_PRINT_E_TIME,KEY_ARRANGE_CNT,KEY_RESULT_DETAIL
31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - BRANCO.pdf,NG,Cyan:0.624cc Magenta:0.716cc Yellow:0.784cc Black:0.004cc White:9.388cc White:9.388cc Clear:0.000cc Clear:0.000cc,20260914_170723,20260914_170740,20260914_170822,,4,ERROR_PRINT
31153 - Item 2 - Pro-Phisical - Vinil Transparente - 350x50mm - COR.pdf,NG,Cyan:0.624cc Magenta:0.716cc Yellow:0.784cc Black:0.004cc White:9.388cc White:9.388cc Clear:0.000cc Clear:0.000cc,20260914_170741,20260914_170758,20260914_170822,,4,ERROR_PRINT
`;

describe('parsePrintCsv', () => {
  it('ignora header e linhas vazias', () => {
    expect(parsePrintCsv('')).toEqual([]);
    expect(parsePrintCsv('KEY_FILENAME,KEY_RESULT,KEY_INKUSE,KEY_RIP_S_TIME,KEY_RIP_E_TIME,KEY_PRINT_S_TIME,KEY_PRINT_E_TIME,KEY_ARRANGE_CNT,KEY_RESULT_DETAIL\n')).toEqual([]);
  });

  it('parses 31180 OK: 1 linha, canais de tinta e filename completo', () => {
    const rows = parsePrintCsv(okCsv31180);
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.keyFilename).toBe('31180 - José Augusto - Vinil Adesivo Branco Brilho - 60x60 - 88un.pdf');
    expect(row.result).toBe('OK');
    expect(row.resultDetail).toBeNull();
    expect(row.arrangeCnt).toBe(1);
    expect(row.ripSTime).toBe('20260915_145744');
    expect(row.ripETime).toBe('20260915_145808');
    expect(row.printSTime).toBe('20260915_145808');
    expect(row.printETime).toBe('20260915_150513');

    expect(row.inks.cyan).toBe(1.277);
    expect(row.inks.magenta).toBe(1.062);
    expect(row.inks.yellow).toBe(0.928);
    expect(row.inks.black).toBe(0.984);
    expect(row.inks.white1).toBe(0);
    expect(row.inks.white2).toBe(0);
    expect(row.inks.varnish1).toBe(0);
    expect(row.inks.varnish2).toBe(0);
    expect(row.inks.total).toBe(4.251);

    expect(row.filenameMeta.orderCode).toBe('31180');
    expect(row.filenameMeta.client).toBe('José Augusto');
    expect(row.filenameMeta.material).toBe('Vinil Adesivo Branco Brilho');
    expect(row.filenameMeta.widthMm).toBe(60);
    expect(row.filenameMeta.heightMm).toBe(60);
    expect(row.filenameMeta.units).toBe(88);
    expect(row.filenameMeta.copies).toBeNull();
    expect(row.filenameMeta.parseErrors).toContain('tamanho sem unidade — assumido mm');
  });

  it('parses 31153 OK: 2 linhas (BRANCO+COR), arrange 4, tintas com branco', () => {
    const rows = parsePrintCsv(okCsv31153);
    expect(rows).toHaveLength(2);

    const branco = rows[0]!;
    const cor = rows[1]!;

    expect(branco.result).toBe('OK');
    expect(cor.result).toBe('OK');
    expect(branco.arrangeCnt).toBe(4);
    expect(cor.arrangeCnt).toBe(4);

    expect(branco.inks.white1).toBe(9.388);
    expect(branco.inks.white2).toBe(9.388);
    expect(branco.inks.cyan).toBe(0.624);
    expect(branco.inks.total).toBe(20.904);

    expect(cor.filenameMeta.orderCode).toBe('31153');
    expect(cor.filenameMeta.client).toBe('Pro-Phisical');
    expect(cor.filenameMeta.material).toBe('Vinil Transparente');
    expect(cor.filenameMeta.widthMm).toBe(350);
    expect(cor.filenameMeta.heightMm).toBe(50);
    expect(cor.filenameMeta.units).toBeNull();
    expect(cor.filenameMeta.parseErrors).not.toContain('tamanho não reconhecido no nome');
  });

  it('captura NG: resultDetail ERROR_PRINT e fim de impressão vazio', () => {
    const rows = parsePrintCsv(ngCsv31153);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.result).toBe('NG');
      expect(row.resultDetail).toBe('ERROR_PRINT');
      expect(row.printETime).toBeNull();
      expect(row.printSTime).toBe('20260914_170822');
    }
  });
});

describe('extractFilenameMeta', () => {
  it('31025 - copias e unidades explícitas', () => {
    const meta = extractFilenameMeta('31025 - Galgani - ProGO - 240x60mm - Vinil Branco Brilho - 40un - 3 copias.pdf');
    expect(meta.orderCode).toBe('31025');
    expect(meta.client).toBe('Galgani');
    expect(meta.widthMm).toBe(240);
    expect(meta.heightMm).toBe(60);
    expect(meta.units).toBe(40);
    expect(meta.copies).toBe(3);
    expect(meta.material).toBe('Vinil Branco Brilho');
  });

  it('extrai bobina serial de diferentes formatos', () => {
    expect(extractBobinaSerial('31188 - Galgani - BOB-4290 - 50x50mm.pdf')).toBe('BOB-4290');
    expect(extractBobinaSerial('31188 - BOB_4290 - teste.pdf')).toBe('BOB-4290');
    expect(extractBobinaSerial('31188 - BOB4290 - teste.pdf')).toBe('BOB-4290');
    expect(extractBobinaSerial('31188 - [BOB-3702] - Vinil.pdf')).toBe('BOB-3702');
    expect(extractBobinaSerial('BOB-5832 - 31188.pdf')).toBe('BOB-5832');
    expect(extractBobinaSerial('31188 - sem bobina.pdf')).toBeNull();

    const meta = extractFilenameMeta('31188 - Galgani - BOB-4290 - Vinil Adesivo - 50x50mm - 100un.pdf');
    expect(meta.orderCode).toBe('31188');
    expect(meta.client).toBe('Galgani');
    expect(meta.bobinaSerial).toBe('BOB-4290');
    expect(meta.material).toBe('Vinil Adesivo');
  });

  it('nome sem código de pedido não quebra', () => {
    const meta = extractFilenameMeta('Projeto Sem Codigo - 30x20cm.pdf');
    expect(meta.orderCode).toBeNull();
    expect(meta.client).toBe('Projeto Sem Codigo');
    expect(meta.widthMm).toBe(30);
    expect(meta.heightMm).toBe(20);
  });

  it('filename vazio vira erro de parse', () => {
    const meta = extractFilenameMeta('');
    expect(meta.client).toBeNull();
    expect(meta.parseErrors).toHaveLength(1);
  });

  it('tolerante a vírgula decimal no tamanho', () => {
    const meta = extractFilenameMeta('12345 - Cliente - Vinil - 12,5x8,5cm.pdf');
    expect(meta.widthMm).toBe(12.5);
    expect(meta.heightMm).toBe(8.5);
  });
});
