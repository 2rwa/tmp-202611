import { fitSample } from './fit-core.mjs';
self.onmessage = async ({ data }) => {
  try {
    const result = await fitSample(data, detail =>
      self.postMessage({ type: 'progress', detail }));
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message || error) });
  }
};