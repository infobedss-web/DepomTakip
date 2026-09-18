import { parseWorkbook } from './product-import-data';
self.onmessage = (
  event: MessageEvent<{ buffer: ArrayBuffer; filename: string; sheet?: string }>,
) => {
  try {
    self.postMessage({
      data: parseWorkbook(event.data.buffer, event.data.filename, event.data.sheet),
    });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
