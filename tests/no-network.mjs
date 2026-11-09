// Preloaded only in RSS fixture builds: fail rather than silently going online.
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

function blocked() {
  throw new Error('Unexpected network request during offline RSS build');
}
globalThis.fetch = blocked;
http.get = http.request = https.get = https.request = blocked;
syncBuiltinESMExports();
