// Keep native and compatibility runtime resources from the same llama.cpp source build.
export function needsAppleWebKitFallback(userAgent){
  return (userAgent.includes('Version/') && userAgent.includes('Safari')) ||
    (/(iPhone|iPad|iPod)/.test(userAgent) && /AppleWebKit/.test(userAgent));
}
export function getRuntimeAssets(moduleURL) {
  const base = new URL('.', moduleURL);
  return {
    default: new URL('wasm/wllama.wasm', base).href,
    compat: {
      worker: new URL('compat/wllama.js', base).href,
      wasm: new URL('compat/wllama.wasm', base).href
    }
  };
}
