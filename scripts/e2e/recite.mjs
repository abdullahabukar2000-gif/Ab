// End-to-end check of recitation mode, run on GitHub Actions: a real recitation
// (Husary, Ibrahim 14:1-14:5 with 14:3 left out on purpose) is fed to the app
// as its microphone; we report which words it marked right or wrong, how many
// mistake sounds it made, and whether the translation blocks revealed.
import { chromium } from 'playwright';
const wav = process.argv[2];
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage({ viewport: { width: 430, height: 932 } });
pg.on('console', (m) => { if (m.text().startsWith('recitation:')) console.log('  ', m.text()); });
pg.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
pg.on('dialog', (d) => d.accept());
await pg.addInitScript(() => {
  localStorage.setItem('page', '255'); localStorage.setItem('view', 'verses'); localStorage.setItem('cover', 'yes');
  window.__beeps = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__beeps++; return orig.call(this); };
});
await pg.goto('http://localhost:8080/'); await pg.waitForTimeout(3000);
const t0 = Date.now();
await pg.click('#recite');
let last = '';
while (Date.now() - t0 < 140000) { // the recording is ~128 s (it would then loop)
  const s = await pg.evaluate(() => document.querySelector('#listenbar')?.textContent || '');
  if (s !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s  ${s}`); last = s; }
  await pg.waitForTimeout(1000);
}
await pg.waitForTimeout(3000);
const r = await pg.evaluate(() => {
  const out = {};
  for (const k of ['14:1', '14:2', '14:3', '14:4', '14:5', '14:6']) {
    const a = document.getElementById('ayah-' + k.replace(':', '-'));
    if (!a) continue;
    out[k] = { words: a.querySelectorAll('.vw:not(.end)').length, ok: a.querySelectorAll('.vw.mark-ok').length, err: a.querySelectorAll('.vw.mark-err').length,
      revealed: `${a.querySelectorAll('.english-part.open').length}/${a.querySelectorAll('.english-part').length}`,
      marks: [...a.querySelectorAll('.vw:not(.end)')].map((w) => (w.classList.contains('mark-ok') ? '✓' : w.classList.contains('mark-err') ? '✗' : '·')).join('') };
  }
  return { ayahs: out, beeps: window.__beeps / 2, bar: document.querySelector('#listenbar')?.textContent };
});
console.log(JSON.stringify(r, null, 1));
await pg.screenshot({ path: 'recite.png' });
await b.close();
