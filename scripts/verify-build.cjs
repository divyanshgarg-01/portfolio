const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const failures = [];

function expectFile(relativePath) {
  const full = path.join(dist, relativePath.replace(/^\/+/, ''));
  if (!fs.existsSync(full)) failures.push(`missing dist file: ${relativePath}`);
}

function expectText(relativePath, fragments) {
  const full = path.join(dist, relativePath.replace(/^\/+/, ''));
  if (!fs.existsSync(full)) {
    failures.push(`missing dist file: ${relativePath}`);
    return;
  }
  const text = fs.readFileSync(full, 'utf8');
  for (const fragment of fragments) {
    if (!text.includes(fragment)) failures.push(`${relativePath} missing fragment: ${fragment}`);
  }
}

function jsonFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

if (!fs.existsSync(dist)) {
  console.error('BUILD_VERIFY_FAILED: dist directory missing');
  process.exit(1);
}

expectText('index.html', [
  '__variable_482ce5',
  'data-intro',
  'data-hero-intent',
  'Divyansh Garg — Data, Business &amp; Technology',
  '/portfolio/assets/',
]);
for (const file of [
  'admin/index.html',
  'admin/config.yml',
  '.nojekyll',
  'favicon.svg',
  'uploads/resume/Divyansh_Garg_CV.pdf',
  'uploads/profile/divyansh-portrait-reveal.webp',
]) expectFile(file);

for (const font of fs.readdirSync(path.join(root, 'public', 'fonts'))) expectFile(`fonts/${font}`);
for (const font of fs.readdirSync(path.join(root, 'public', 'assets', 'fraunces'))) expectFile(`assets/fraunces/${font}`);

for (const file of jsonFiles(path.join(root, 'src', 'content', 'achievements'))) {
  if (file.fileUrl) expectFile(file.fileUrl);
}
for (const file of jsonFiles(path.join(root, 'src', 'content', 'projects'))) {
  if (file.coverImage) expectFile(file.coverImage);
}

const cssFiles = fs.readdirSync(path.join(dist, 'assets')).filter((name) => name.endsWith('.css'));
if (!cssFiles.length) failures.push('no built CSS file');
for (const cssFile of cssFiles) {
  const css = fs.readFileSync(path.join(dist, 'assets', cssFile), 'utf8');
  if (css.includes('/_next/static/media/')) failures.push(`${cssFile} still references Next media`);
  if (css.includes('url(/fonts/')) failures.push(`${cssFile} still references unbased fonts`);
}
for (const jsFile of fs.readdirSync(path.join(dist, 'assets')).filter((name) => name.endsWith('.js'))) {
  const js = fs.readFileSync(path.join(dist, 'assets', jsFile), 'utf8');
  for (const deadRoute of ['/api/certificates/', '/api/achievements/']) {
    if (js.includes(deadRoute)) failures.push(`${jsFile} still references dead route: ${deadRoute}`);
  }
}

if (failures.length) {
  console.error(`BUILD_VERIFY_FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('BUILD_VERIFY_OK');
