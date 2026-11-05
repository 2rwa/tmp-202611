'use strict';
// Patch only the pinned upstream wllama revision used by this project.
// Safari's reported JSPI/Memory64 support is not sufficient for this build;
// both native macOS Safari and iOS WebKit must use the matching 32-bit compat worker.
const fs=require('node:fs');
const path=require('node:path');
const root=process.argv[2];
if(!root)throw Error('Usage: node scripts/patch-wllama-safari.cjs /path/to/wllama');
function patch(file,from,to){
 const filename=path.join(root,file);
 const input=fs.readFileSync(filename,'utf8');
 if(!input.includes(from))throw Error('Pinned upstream changed; patch must be reviewed: '+file+' '+from);
 const output=input.replace(from,to);
 if(output===input)throw Error('No patch applied: '+file);
 fs.writeFileSync(filename,output);
 console.log('Patched',file);
}
patch('src/utils.ts',
 'export const needCompat = () => !isSupportJSPI() || !isSupportMem64();',
 `// Safari/WebKit can advertise JSPI and Memory64 yet fail to run the native build.
export const needCompat = () =>
  !isSupportJSPI() || !isSupportMem64() ||
  /Version\\/([0-9._]+).*Safari/.test(navigator.userAgent) ||
  (/(iPhone|iPad|iPod)/.test(navigator.userAgent) && /AppleWebKit/.test(navigator.userAgent));`);
patch('src/worker.ts',
 `        let newMsg = message.replace(
          'Build with -sASSERTIONS for more info.',
          ''
        );`,
 `        // Emscripten onAbort can provide an object, not a string.
        // Keep the real abort visible instead of throwing in this handler.
        const readableMessage = typeof message === 'string'
          ? message
          : (typeof (message as any)?.message === 'string'
            ? (message as any).message
            : String(message));
        let newMsg = readableMessage.replace(
          'Build with -sASSERTIONS for more info.',
          ''
        );`);
patch('src/worker.ts',
 "          stack = rawStack.replace(/\\|/g, '\\n');",
 "          stack = String(rawStack ?? '').replace(/\\|/g, '\\n');");
