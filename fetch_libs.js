const fs = require('fs');
const https = require('https');
const path = require('path');

const filesToDownload = [
  {
    url: 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js',
    dest: 'libs/three.module.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/utils/SkeletonUtils.js',
    dest: 'libs/three/examples/jsm/utils/SkeletonUtils.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js',
    dest: 'libs/three/examples/jsm/loaders/GLTFLoader.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/DRACOLoader.js',
    dest: 'libs/three/examples/jsm/loaders/DRACOLoader.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.11.2/rapier.es.js',
    dest: 'libs/rapier.es.js'
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm',
    dest: 'libs/gsap.js'
  },
  // Draco Decoders
  {
    url: 'https://www.gstatic.com/draco/v1/decoders/draco_decoder.wasm',
    dest: 'libs/draco/draco_decoder.wasm'
  },
  {
    url: 'https://www.gstatic.com/draco/v1/decoders/draco_wasm_wrapper.js',
    dest: 'libs/draco/draco_wasm_wrapper.js'
  },
  {
    url: 'https://www.gstatic.com/draco/v1/decoders/draco_decoder.js',
    dest: 'libs/draco/draco_decoder.js'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    
    https.get(url, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
             redirectUrl = new URL(redirectUrl, url).href;
        }
        return downloadFile(redirectUrl, dest).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to get '${url}' (${res.statusCode})`));
      }

      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Downloading dependencies locally to satisfy YouTube Playables policy...');
  for (const file of filesToDownload) {
    try {
      await downloadFile(file.url, file.dest);
    } catch (e) {
      console.error(`Error downloading ${file.dest}:`, e);
    }
  }
  console.log('Done!');
}

run();
