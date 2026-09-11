import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';

export interface MimakiJobInput {
  machine_id: string;
  folder_timestamp: string;
  job_name: string;
  order_code?: string | null;
  quantity_units?: number;
  pages?: number;
  copies?: number;
  copy?: number;
  copy_number?: number;
  total_print?: number;
  pass_count?: number;
  resolution_dpi?: number;
  print_direction?: string;
  width_mm: number;
  height_mm: number;
  ink_cyan_cc?: number;
  ink_magenta_cc?: number;
  ink_yellow_cc?: number;
  ink_black_cc?: number;
  ink_white1_cc?: number;
  ink_white2_cc?: number;
  ink_varnish1_cc?: number;
  ink_varnish2_cc?: number;
  ink_total_cc?: number;
  raw_material_name?: string | null;
}

export interface MimakiJobResult {
  job_id: string;
  length_meters: number;
  material_status: string;
  stock_item_id: string | null;
  updated?: boolean;
}

interface MimakiQueueTask {
  data: MimakiJobInput;
  resolve: (res: MimakiJobResult) => void;
  reject: (err: Error) => void;
}

export type JobProcessor = (app: FastifyInstance, job: MimakiJobInput) => Promise<MimakiJobResult>;

let globalProcessor: JobProcessor | null = null;
let streamQueue: MimakiQueueStream | null = null;

export function registerMimakiProcessor(processor: JobProcessor): void {
  globalProcessor = processor;
}

class MimakiQueueStream extends Writable {
  constructor(private app: FastifyInstance) {
    super({ objectMode: true, highWaterMark: 1000 });
  }

  async _write(task: MimakiQueueTask, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    try {
      if (!globalProcessor) {
        throw new Error('Mimaki job processor not registered');
      }
      const result = await globalProcessor(this.app, task.data);
      task.resolve(result);
      callback();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      task.reject(error);
      callback();
    }
  }
}

function getStreamQueue(app: FastifyInstance): MimakiQueueStream {
  if (!streamQueue) {
    streamQueue = new MimakiQueueStream(app);
  }
  return streamQueue;
}

export function enqueueMimakiJob(app: FastifyInstance, data: MimakiJobInput): Promise<MimakiJobResult> {
  const queue = getStreamQueue(app);
  return new Promise((resolve, reject) => {
    queue.write({ data, resolve, reject });
  });
}
