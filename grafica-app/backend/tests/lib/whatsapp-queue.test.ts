import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatStockAlertsMessage,
  enqueueStockAlert,
  flushStockAlertBatch,
  getQueueStatus,
  enqueueOutboundMessage,
  clearOutboundQueueForTest,
  type StockAlertData,
} from '../../src/lib/whatsapp.js';

describe('WhatsApp queue and alert bundling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearOutboundQueueForTest();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats a single stock alert with clear individual details', () => {
    const single: StockAlertData[] = [
      {
        itemId: 'item-1',
        itemName: 'Tinta UV Cyan',
        unit: 'ml',
        newQty: 400,
        minQuantity: 500,
        status: 'LOW_STOCK',
      },
    ];

    const message = formatStockAlertsMessage(single);
    expect(message).toContain('Aviso de Estoque — GraficaOS');
    expect(message).toContain('Tinta UV Cyan');
    expect(message).toContain('Estoque Baixo');
    expect(message).toContain('400 ml');
    expect(message).toContain('500 ml');
  });

  it('bundles multiple alerts (e.g. 5 materials) into a single consolidated message', () => {
    const multiple: StockAlertData[] = [
      { itemId: 'item-1', itemName: 'Tinta UV Cyan', unit: 'ml', newQty: 400, minQuantity: 500, status: 'LOW_STOCK' },
      { itemId: 'item-2', itemName: 'Tinta UV Magenta', unit: 'ml', newQty: 350, minQuantity: 500, status: 'LOW_STOCK' },
      { itemId: 'item-3', itemName: 'Tinta UV Yellow', unit: 'ml', newQty: 200, minQuantity: 500, status: 'LOW_STOCK' },
      { itemId: 'item-4', itemName: 'Tinta UV Black', unit: 'ml', newQty: 0, minQuantity: 500, status: 'OUT_OF_STOCK' },
      { itemId: 'item-5', itemName: 'Bobina de Vinil 1.37m', unit: 'm', newQty: 15, minQuantity: 50, status: 'LOW_STOCK' },
    ];

    const message = formatStockAlertsMessage(multiple);

    // Deve indicar o total de materiais agrupados
    expect(message).toContain('5 materiais');
    expect(message).toContain('Tinta UV Cyan');
    expect(message).toContain('Tinta UV Magenta');
    expect(message).toContain('Tinta UV Yellow');
    expect(message).toContain('Tinta UV Black');
    expect(message).toContain('Estoque Zerado');
    expect(message).toContain('Bobina de Vinil 1.37m');
    // Deve ser uma única mensagem
    expect(message.split('Aviso de Estoque — GraficaOS').length - 1).toBe(1);
  });

  it('accumulates alerts arriving within the batch window into a single batch', () => {
    enqueueStockAlert({
      itemId: 'mat-1',
      itemName: 'Material A',
      unit: 'm',
      newQty: 2,
      minQuantity: 10,
      status: 'LOW_STOCK',
    });

    enqueueStockAlert({
      itemId: 'mat-2',
      itemName: 'Material B',
      unit: 'm',
      newQty: 1,
      minQuantity: 10,
      status: 'LOW_STOCK',
    });

    const status = getQueueStatus();
    expect(status.pendingAlerts).toBe(2);

    // Flusha o lote
    flushStockAlertBatch();
    const statusAfter = getQueueStatus();
    expect(statusAfter.pendingAlerts).toBe(0);
  });

  it('deduplicates identical text in the outbound queue', async () => {
    const text = 'Mensagem duplicada teste';
    const p1 = enqueueOutboundMessage(text);
    const p2 = enqueueOutboundMessage(text);

    // p2 não deve criar um segundo item na fila
    const status = getQueueStatus();
    expect(status.queuedMessages).toBeLessThanOrEqual(1);
  });
});
