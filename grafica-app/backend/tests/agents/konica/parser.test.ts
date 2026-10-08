import { describe, it, expect } from 'vitest';
import {
  isKonicaDuplex,
  calculateKonicaSheets,
  parseJobs,
} from '../../../src/agents/konica/parser.js';

describe('isKonicaDuplex: identificação de frente e verso', () => {
  it('detecta frente-verso explícito no nome', () => {
    expect(isKonicaDuplex('Marca_Pagina_Marina_-_6_imp_frente-verso_-_Couche_250g.pdf')).toBe(true);
    expect(isKonicaDuplex('31173 - Bellune_-_7_imp_frente-verso_-_Couche_250g.pdf')).toBe(true);
    expect(isKonicaDuplex('teste_frente e verso_couche.pdf')).toBe(true);
    expect(isKonicaDuplex('Job_123_FrenteVerso.pdf')).toBe(true);
    expect(isKonicaDuplex('convite - f/v - couche 250g')).toBe(true);
    expect(isKonicaDuplex('cartao - f-v - couche 300g')).toBe(true);
  });

  it('detecta notação gráfica de cores 4x4, 4x1, 1x1', () => {
    expect(isKonicaDuplex('31088 - Item 2 - Mariana Cestari - Couche 250 - 4x4 - Cantos Ar')).toBe(true);
    expect(isKonicaDuplex('31066 - Simao Doces - Voucher de Desconto - Couche 300g - 4x4 C')).toBe(true);
    expect(isKonicaDuplex('folheto_couche_115g_4x1.pdf')).toBe(true);
    expect(isKonicaDuplex('receituario_1x1_sulfite.pdf')).toBe(true);
    expect(isKonicaDuplex('4x2_cartao.pdf')).toBe(true);
  });

  it('detecta termos editoriais em papel comum/couché (miolo, folder, flyer, cardápio)', () => {
    expect(isKonicaDuplex('31096 - leticia - folder - couche 115g.PDF')).toBe(true);
    expect(isKonicaDuplex('31123 - souza e cia - folder 2 dobras - couche 250g - ok.PDF')).toBe(true);
    expect(isKonicaDuplex('31161 - nadia - livro - miolo - 148x210mm - 150g - ok.PDF')).toBe(true);
    expect(isKonicaDuplex('31275 - jau serve - cardapio - 210x297 - couche 150g - ok.PDF')).toBe(true);
    expect(isKonicaDuplex('31376 - jau serve - flyer - 150x100mm - couche 150g - ok.PDF')).toBe(true);
  });

  it('NÃO classifica adesivo ou vinil como duplex (face única / liner), a menos que explicitamente indicado', () => {
    expect(isKonicaDuplex('31087 - Marcela Esposito - Artes Cartaz, Topo de Bolo e Etiquet', 'Adesivo Couché')).toBe(false);
    expect(isKonicaDuplex('etiqueta vinil transparente', 'Vinil Transparente')).toBe(false);
    expect(isKonicaDuplex('adesivo 5x5 couche')).toBe(false);
  });

  it('classifica adesivo como duplex SE tiver o termo explícito frente-verso', () => {
    expect(isKonicaDuplex('adesivo especial frente-verso vitrine')).toBe(true);
  });

  it('mantém jobs comuns de só frente como simplex', () => {
    expect(isKonicaDuplex('31120 - jau serve - cartaz a5 - 210x148mm - couche 250g - ok.PD')).toBe(false);
    expect(isKonicaDuplex('Loja 49 - STOPPER.pdf')).toBe(false);
    expect(isKonicaDuplex('31118 - o boticario - precificador - couche 250g')).toBe(false);
  });
});

describe('calculateKonicaSheets: cálculo físico de folhas', () => {
  it('frente e verso com 2 páginas e 1 cópia = 1 folha física', () => {
    const sheets = calculateKonicaSheets(2, 1, 2, true);
    expect(sheets).toBe(1);
  });

  it('frente e verso com 2 páginas e 5 cópias = 5 folhas físicas (não 10)', () => {
    const sheets = calculateKonicaSheets(2, 5, 10, true);
    expect(sheets).toBe(5);
  });

  it('frente e verso com 2 páginas e 6 cópias = 6 folhas físicas (não 12)', () => {
    const sheets = calculateKonicaSheets(2, 6, 12, true);
    expect(sheets).toBe(6);
  });

  it('frente e verso com 4 páginas e 1 cópia = 2 folhas físicas (não 4)', () => {
    const sheets = calculateKonicaSheets(4, 1, 4, true);
    expect(sheets).toBe(2);
  });

  it('frente e verso com 3 páginas (ímpar) e 1 cópia = 2 folhas físicas (última folha só frente)', () => {
    const sheets = calculateKonicaSheets(3, 1, 3, true);
    expect(sheets).toBe(2);
  });

  it('frente e verso com 1 página e 10 cópias = 10 folhas físicas (não divide por 2)', () => {
    const sheets = calculateKonicaSheets(1, 10, 10, true);
    expect(sheets).toBe(10);
  });

  it('só frente (simplex) com 1 página e 7 cópias = 7 folhas físicas', () => {
    const sheets = calculateKonicaSheets(1, 7, 7, false);
    expect(sheets).toBe(7);
  });

  it('só frente (simplex) com 5 páginas e 1 cópia = 5 folhas físicas', () => {
    const sheets = calculateKonicaSheets(5, 1, 5, false);
    expect(sheets).toBe(5);
  });
});

describe('parseJobs: integração com payload da Konica', () => {
  it('parseia job frente e verso reduzindo folhas pela metade', () => {
    const payload = {
      jobLists: [
        {
          containerId: 268435444,
          jobs: [
            {
              jobId: 101,
              name: 'Marca_Pagina_Marina_-_6_imp_frente-verso_-_Couche_250g.pdf',
              pages: 2,
              copiesPrinted: 5,
              pagesPrinted: 10,
              datePrintEnd: 1788933713,
              result: 'ok',
              printFeatures: {
                MediaTypeAuto: 'CoatedG',
                TargetPaperSize: 'A3',
              },
            },
          ],
        },
      ],
    };

    const jobs = parseJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].isDuplex).toBe(true);
    expect(jobs[0].pages).toBe(2);
    expect(jobs[0].pagesPrinted).toBe(10);
    expect(jobs[0].sheets).toBe(5); // 5 folhas físicas, não 10!
  });

  it('parseia job simplex mantendo folhas iguais a páginas impressas', () => {
    const payload = {
      jobLists: [
        {
          containerId: 268435444,
          jobs: [
            {
              jobId: 102,
              name: '31120 - cartaz a5 - couche 250g.pdf',
              pages: 1,
              copiesPrinted: 7,
              pagesPrinted: 7,
              datePrintEnd: 1788933713,
              result: 'ok',
              printFeatures: {
                MediaTypeAuto: 'CoatedG',
                TargetPaperSize: 'A3',
              },
            },
          ],
        },
      ],
    };

    const jobs = parseJobs(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].isDuplex).toBe(false);
    expect(jobs[0].pages).toBe(1);
    expect(jobs[0].pagesPrinted).toBe(7);
    expect(jobs[0].sheets).toBe(7);
  });
});
