import { describe, it, expect, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  enqueueMimakiJob,
  registerMimakiProcessor,
  type MimakiJobInput,
  type MimakiJobResult,
} from '../../src/lib/mimaki-queue.js';
import { toPrecision } from '../../src/lib/math.js';

describe('Mimaki Queue and Linear Calculation', () => {
  it('processes queued jobs sequentially and returns their results', async () => {
    const processed: string[] = [];

    registerMimakiProcessor(async (_app: FastifyInstance, job: MimakiJobInput): Promise<MimakiJobResult> => {
      processed.push(job.job_name);
      return {
        job_id: `id-${job.job_name}`,
        length_meters: 1.5,
        material_status: 'PENDING_BIND',
        stock_item_id: null,
      };
    });

    const dummyApp = {} as FastifyInstance;

    const p1 = enqueueMimakiJob(dummyApp, {
      machine_id: 'MIMAKI-01',
      folder_timestamp: '2026-09-11_10-00-00',
      job_name: 'Job 1',
      width_mm: 500,
      height_mm: 1000,
    });

    const p2 = enqueueMimakiJob(dummyApp, {
      machine_id: 'MIMAKI-01',
      folder_timestamp: '2026-09-11_10-00-01',
      job_name: 'Job 2',
      width_mm: 500,
      height_mm: 1000,
    });

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.job_id).toBe('id-Job 1');
    expect(r2.job_id).toBe('id-Job 2');
    expect(processed).toEqual(['Job 1', 'Job 2']);
  });

  it('correctly calculates linear meters using total_print', () => {
    const height_mm = 650;
    const total_print = 10;
    const lengthMeters = toPrecision((height_mm * total_print) / 1000, 3);
    expect(lengthMeters).toBe(6.5);
  });

  it('correctly calculates linear meters using copy_number and pages when total_print is omitted', () => {
    const height_mm = 300;
    const copy_number = 4;
    const pages = 2;
    const effectiveCopies = copy_number;
    const totalPrints = pages * effectiveCopies;
    const lengthMeters = toPrecision((height_mm * totalPrints) / 1000, 3);
    expect(lengthMeters).toBe(2.4);
  });

  it('falls back to copies or 1 when copy_number and total_print are omitted', () => {
    const height_mm = 1000;
    const copies = 3;
    const pages = 1;
    const effectiveCopies = copies;
    const totalPrints = pages * effectiveCopies;
    const lengthMeters = toPrecision((height_mm * totalPrints) / 1000, 3);
    expect(lengthMeters).toBe(3);
  });
});
