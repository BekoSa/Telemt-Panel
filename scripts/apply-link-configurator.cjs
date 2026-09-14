'use strict';

const fs = require('node:fs');

const clientPath = 'src/client.jsx';
let source = fs.readFileSync(clientPath, 'utf8');

const importAnchor = "import '@fontsource/dm-sans/700.css';\n";
const importLine = "import ConnectionLinkConfigurator from './connection-link-configurator.jsx';\n";
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error('font import anchor not found');
  source = source.replace(importAnchor, importAnchor + importLine);
}

const marker = '\n        {/* Telemt 3.5.7 user controls */}\n';
const component = `
        <ConnectionLinkConfigurator
          user={u}
          apiFn={api}
          onSaved={async()=>{
            try{
              const fresh=await api('/users/'+u.username);
              if(fresh?.data) setUser(fresh.data);
            }catch{}
          }}
        />
`;
if (!source.includes('<ConnectionLinkConfigurator')) {
  if (!source.includes(marker)) throw new Error('user controls marker not found');
  source = source.replace(marker, '\n' + component + marker);
}

fs.writeFileSync(clientPath, source);
fs.unlinkSync('scripts/apply-link-configurator.cjs');
fs.unlinkSync('.github/workflows/link-configurator-patch.yml');
