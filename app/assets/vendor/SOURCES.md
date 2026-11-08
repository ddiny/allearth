# Local browser dependencies

- Globe.GL 2.44.0, complete UMD distribution: https://unpkg.com/globe.gl@2.44.0/dist/globe.gl.min.js
- Project and API: https://github.com/vasturiano/globe.gl / https://globe.gl/
- Upstream license: https://raw.githubusercontent.com/vasturiano/globe.gl/v2.44.0/LICENSE (local `globe.gl-LICENSE.txt`).
- Downloaded 2026-10-20. The full UMD includes its rendering dependencies; the app does not import modules or request a CDN at runtime.

The application loads `globe.gl.min.js`, the local geography script, `globe.js`, and `home.js` in that order with classic deferred scripts. This deliberately avoids `fetch()` and ES-module CORS restrictions for a local-file prototype.
