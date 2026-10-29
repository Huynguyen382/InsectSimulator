const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

async function build() {
  console.log('⚡ [1/2] Đang đóng gói mã nguồn (Bundling client ES modules)...');
  const outDir = path.join(__dirname, '..', 'client', 'dist');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const bundlePath = path.join(outDir, 'game.bundle.js');
  const minPath = path.join(outDir, 'game.min.js');

  await esbuild.build({
    entryPoints: [path.join(__dirname, '..', 'client', 'src', 'main.js')],
    bundle: true,
    outfile: bundlePath,
    format: 'esm',
    external: ['three', 'three/*'],
    minify: false
  });

  console.log('🔒 [2/2] Đang xáo trộn mã bảo mật (Obfuscating & Anti-Reverse Engineering)...');
  const code = fs.readFileSync(bundlePath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    numbersToExpressions: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
    splitStrings: true,
    splitStringsChunkLength: 8,
    sourceMap: false
  });

  fs.writeFileSync(minPath, obfuscated.getObfuscatedCode(), 'utf8');

  if (fs.existsSync(bundlePath)) {
    fs.unlinkSync(bundlePath);
  }

  const stat = fs.statSync(minPath);
  console.log(`✅ Build thành công file bảo mật: client/dist/game.min.js (${Math.round(stat.size / 1024)} KB)`);
}

build().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
