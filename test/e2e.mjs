// Production browser checks. Run with npm run test:e2e after npm run build.
import { mkdirSync } from 'node:fs';
import { MODULES, STATS } from '../lib/physics/curriculum.js';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const waitForFixture = async predicate => {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Fixture request did not arrive');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
};
const SHOTS = process.env.SHOT_DIR || 'test/screenshots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
);
try {
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`PAGEERROR ${page.url()} :: ${e.message}`));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (t.startsWith('Failed to load resource:')) return; // HTTP failures checked with their exact URL below
  errs.push(`CONSOLE ${page.url()} :: ${t.slice(0, 180)}`);
});

page.on('response', response => {
  const url = new URL(response.url());
  if (url.origin !== new URL(BASE).origin || response.status() < 400) return;
  if (url.pathname === '/favicon.ico' && response.status() === 404) return;
  if (['/api/physics-tutor', '/api/physics-problem'].includes(url.pathname) && response.status() === 503) return;
  errs.push(`HTTP ${response.status()} ${url.pathname}`);
});

const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

// ── 既存アプリ（root layout を触ったので回帰確認）
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
let txt = await page.textContent('body');
check('既存: カウンセラーのホームが表示される', txt.includes('Andon') && txt.includes("What's on your mind?"));
check('既存: トピックバーが8件', (await page.locator('button .stories-ring').count()) === 8);
const vp = await page.getAttribute('meta[name="viewport"]', 'content');
check('既存: viewport メタタグが出力されている', /width=device-width/.test(vp || ''), vp || 'なし');
const theme = await page.getAttribute('meta[name="theme-color"]', 'content');
check('既存: theme-color が cream', theme === '#faf9f6', theme || 'なし');
await page.goto(BASE + '/chat', { waitUntil: 'networkidle' });
check('既存: チャット画面が開く', (await page.textContent('body')).length > 50);

// ── 物理: theme-color がダークに切り替わる
await page.goto(BASE + '/physics', { waitUntil: 'networkidle' });
const theme2 = await page.getAttribute('meta[name="theme-color"]', 'content');
check('物理: theme-color がダーク', theme2 === '#080a12', theme2 || 'なし');
txt = await page.textContent('body');
check(`物理: ${STATS.total}単元と表示`, txt.includes(String(STATS.total)));
check('物理: 推薦カードが出る', (await page.locator('a[href^="/physics/module/"]').count()) >= 2,
  `${await page.locator('a[href^="/physics/module/"]').count()} 件`);
await page.screenshot({ path: `${SHOTS}/v-home.png` });

// ── カリキュラム: フィルタと検索
await page.goto(BASE + '/physics/curriculum', { waitUntil: 'networkidle' });
const all = await page.locator('a[href^="/physics/module/"]').count();
check('カリキュラム: 全単元が並ぶ', all === STATS.total, `${all} 件 / 定義 ${STATS.total} 件`);
await page.getByRole('button', { name: /量子情報・量子計算/ }).click();
await page.waitForFunction(count => document.querySelectorAll('a[href^="/physics/module/"]').length === count, STATS.byTrack.qinfo);
const qinfo = await page.locator('a[href^="/physics/module/"]').count();
check('カリキュラム: 量子情報で絞れる', qinfo === STATS.byTrack.qinfo, `${qinfo} 件 / 定義 ${STATS.byTrack.qinfo} 件`);
await page.fill('input[placeholder*="キーワード"]', 'Grover');
await page.waitForTimeout(400);
const grover = await page.locator('a[href^="/physics/module/"]').count();
check('カリキュラム: 検索が効く（Grover）', grover >= 1, `${grover} 件`);

// ── 高校段階が実用的な厚みを持つか
await page.goto(BASE + '/physics/curriculum?level=hs', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const hsCards = await page.locator('a[href^="/physics/module/"]').count();
const hsDefined = MODULES.filter((m) => m.level === 'hs').length;
check('高校: 全単元が並ぶ', hsCards === hsDefined, `${hsCards} 件 / 定義 ${hsDefined} 件`);
const hsText = await page.textContent('body');
for (const topic of ['力のつり合い', '運動量と力積', '剛体のつり合い', '直流回路', 'コンデンサー', 'ローレンツ力', '交流', '熱量の保存', 'ドップラー', '全反射', '原子核', '有効数字']) {
  check(`高校: 「${topic}」の単元がある`, hsText.includes(topic));
}
for (const course of ['物理基礎', '物理']) {
  const expected = MODULES.filter(m => m.level === 'hs' && m.course === course).length;
  const badges = await page.locator('a[href^="/physics/module/"] span').filter({ hasText: new RegExp(`^${course}$`) }).count();
  check(`高校: ${course}の区分が各カードに表示される`, badges === expected, `${badges} 件 / 定義 ${expected} 件`);
}

// ── 段階を移した単元: 旧リンクと保存済みデータの互換性
await page.evaluate(() => {
  localStorage.setItem('physics.progress.v1', JSON.stringify({ modules: {
    'qm-phd-04': { status: 'mastered', reps: 2, attempts: 4, correct: 4, updatedAt: '2026-01-01T00:00:00Z', reviewAt: '2099-01-01T00:00:00Z' },
  } }));
  localStorage.setItem('physics.tutor.v1', JSON.stringify({ 'qm-phd-04': [{ role: 'user', content: '保存した場の量子論の質問' }] }));
});
await page.goto(BASE + '/physics/module/qm-phd-04', { waitUntil: 'networkidle' });
check('旧単元URL: 移動先の教材と習得状態を表示する', (await page.locator('h1').textContent()).includes('場の量子論 I') && await page.locator('header span').filter({ hasText: /^習得$/ }).count() === 1);
check('旧単元URL: 演習へのリンクは新IDを使う', await page.getByRole('link', { name: '演習をつくる' }).getAttribute('href') === '/physics/practice?module=qm-grad-09');
await page.goto(BASE + '/physics/practice?module=qm-phd-04', { waitUntil: 'networkidle' });
check('旧演習URL: 新IDの単元が選択される', await page.getByRole('combobox', { name: '単元' }).inputValue() === 'qm-grad-09');
await page.goto(BASE + '/physics/tutor?module=qm-grad-09', { waitUntil: 'networkidle' });
check('単元ID移動: チューター履歴を引き継ぐ', (await page.textContent('body')).includes('保存した場の量子論の質問'));
await page.getByRole('button', { name: '会話を消す', exact: true }).click();
await page.goto(BASE + '/physics/tutor?module=qm-phd-04', { waitUntil: 'networkidle' });
check('単元ID移動: 消した会話が旧URLで復活しない', !(await page.textContent('body')).includes('保存した場の量子論の質問'));
await page.evaluate(() => { localStorage.removeItem('physics.progress.v1'); localStorage.removeItem('physics.tutor.v1'); });

// ── 単元詳細: 数式と進捗
await page.goto(BASE + '/physics/module/qm-ug-02', { waitUntil: 'networkidle' });
check('単元: KaTeXで数式が描画される', (await page.locator('.katex').count()) >= 2, `${await page.locator('.katex').count()} 個`);
await page.getByRole('button', { name: '習得にする' }).click();
await page.waitForTimeout(300);
check('単元: 状態が「習得」になる', (await page.textContent('body')).includes('習得'));
await page.goto(BASE + '/physics', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
txt = (await page.textContent('body')).replace(/\s+/g, ' ');
check('進捗: localStorageに保存されホームへ反映', txt.includes(`習得 1 / ${STATS.total}`));

await page.goto(BASE + '/physics/lab', { waitUntil: 'networkidle' });
const labIds = new Set(MODULES.flatMap((m) => m.labs || []));
const labLinks = await page.getByRole('link', { name: '開く', exact: true }).count();
check('ラボ一覧: 単元から参照される全ラボに入口がある', labLinks >= labIds.size, `入口 ${labLinks} 件 / 参照 ${labIds.size} 種`);

// ── 回路ラボ
await page.goto(BASE + '/physics/lab/circuit', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Grover探索（3量子ビット/ }).click();
await page.waitForTimeout(600);
txt = await page.textContent('body');
const m101 = txt.match(/\|101⟩[\s\S]{0,40}?(\d+\.\d)%/);
check('回路: Grover3量子ビットで|101⟩が約94.5%', m101 && Math.abs(parseFloat(m101[1]) - 94.5) < 0.6, m101 ? m101[1] + '%' : '取得できず');
await page.getByRole('button', { name: /Bellペア/ }).click();
await page.waitForTimeout(500);
txt = await page.textContent('body');
check('回路: Bellでエントロピー合計が2 bit', /単一量子ビットの縮約エントロピー合計\s*2\.000/.test(txt.replace(/\s+/g,' ')));
await page.getByRole('button', { name: '1024ショット測定' }).click();
await page.waitForTimeout(800);
check('回路: ショット測定が動く', (await page.textContent('body')).includes('サンプリング結果'));
await page.getByRole('button', { name: '回路を消去' }).click();
await page.getByRole('button', { name: 'H', exact: true }).first().click();
await page.getByRole('button', { name: 'ゲートを追加' }).click();
await page.waitForTimeout(300);
check('回路: 手動でゲートを追加できる', /1 演算/.test(await page.textContent('body')));
await page.screenshot({ path: `${SHOTS}/v-circuit.png` });

// ── Bloch球ラボ
await page.goto(BASE + '/physics/lab/bloch', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'H', exact: true }).first().click();
await page.waitForTimeout(300);
txt = await page.textContent('body');
check('Bloch: H|0⟩ で r=(1,0,0)', /r = \(1\.000, 0\.000, 0\.000\)/.test(txt));
check('Bloch: 純粋状態と判定される', txt.includes('純粋状態'));
await page.getByRole('button', { name: /位相緩和/ }).click();
await page.waitForTimeout(300);
txt = await page.textContent('body');
check('Bloch: 位相緩和で混合状態になる', txt.includes('混合状態'));
await page.getByRole('button', { name: '1回測定して収縮させる' }).click();
await page.waitForTimeout(300);
check('Bloch: 測定で収縮する', /r = \(0\.000, 0\.000, (1\.000|-1\.000)\)/.test(await page.textContent('body')));
await page.screenshot({ path: `${SHOTS}/v-bloch.png` });

// ── 固有状態ソルバ
await page.goto(BASE + '/physics/lab/well', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
txt = await page.textContent('body');
check('固有値: 調和振動子 E0 ≈ 0.5', /0\.4999\d/.test(txt), (txt.match(/E0 = ([\d.]+)/)||[])[1]);
await page.getByRole('button', { name: '無限井戸' }).click();
await page.waitForTimeout(1400);
txt = await page.textContent('body');
const e0 = (txt.match(/E0 = ([\d.]+)/) || [])[1];
check('固有値: 無限井戸 E0 ≈ 4.9348', e0 && Math.abs(parseFloat(e0) - 4.9348) < 0.01, e0);
await page.getByRole('button', { name: '二重井戸' }).click();
await page.waitForTimeout(1400);
check('固有値: 二重井戸も解ける', /E0 =/.test(await page.textContent('body')));
await page.screenshot({ path: `${SHOTS}/v-well.png` });

// ── 波束トンネル
await page.goto(BASE + '/physics/lab/tunnel', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '実行' }).click();
await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === '実行' && b.disabled), { timeout: 30000 });
txt = await page.textContent('body');
const T = parseFloat((txt.match(/波束の実測透過率\s*([\d.]+)%/) || [])[1]);
const norm = (txt.match(/∫\|ψ\|²dx = ([\d.]+)/) || [])[1];
check('トンネル: 透過率が理論値近傍（4〜7%）', T > 3.5 && T < 7, T + '%');
check('トンネル: 規格化が保存される', Math.abs(parseFloat(norm) - 1) < 1e-5, norm);
check('トンネル: 自動停止後は再実行を禁止する', await page.getByRole('button', { name: '実行', exact: true }).isDisabled());
await page.screenshot({ path: `${SHOTS}/v-tunnel.png` });

// ── 物理数学ビジュアライザ
await page.goto(BASE + '/physics/lab/math', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
let mtxt = await page.textContent('body');
check('数学ラボ: 既定でベクトル場が出る', mtxt.includes('放射状') && mtxt.includes('∇·F ='));
check('数学ラボ: 矢印が描かれている', (await page.locator('svg line').count()) > 100,
  `${await page.locator('svg line').count()} 本`);
await page.getByRole('button', { name: '2次元のクーロン場' }).click();
await page.waitForTimeout(500);
mtxt = await page.textContent('body');
check('数学ラボ: Gaussの法則の説明が出る', mtxt.includes('半径を変えても変わりません'));
await page.getByRole('button', { name: 'フーリエ級数' }).click();
await page.waitForTimeout(500);
const errBefore = parseFloat((await page.textContent('body')).match(/二乗平均平方根誤差\s*([\d.]+)/)[1]);
await page.locator('input[type=range]').first().fill('40');
await page.waitForTimeout(500);
const errAfter = parseFloat((await page.textContent('body')).match(/二乗平均平方根誤差\s*([\d.]+)/)[1]);
check('数学ラボ: 項数を増やすと誤差が減る', errAfter < errBefore, `${errBefore} → ${errAfter}`);
await page.getByRole('button', { name: '複素写像' }).click();
await page.waitForTimeout(400);
check('数学ラボ: 複素写像の格子が描かれる', (await page.locator('svg path').count()) > 15);
await page.getByRole('button', { name: '固有ベクトル' }).click();
await page.waitForTimeout(400);
mtxt = await page.textContent('body');
check('数学ラボ: 固有値が表示される', /固有値 λ₁ = /.test(mtxt) || mtxt.includes('複素数'));
await page.getByRole('button', { name: 'テイラー展開' }).click();
await page.waitForTimeout(400);
check('数学ラボ: テイラー展開が描かれる', (await page.textContent('body')).includes('収束半径'));

// ── チューター・演習（APIキー無しでもUIが壊れないこと）
await page.goto(BASE + '/physics/tutor', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '導出' }).click();
await page.fill('textarea', 'テスト送信');
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
txt = await page.textContent('body');
check('チューター: APIキー無しでエラーを日本語表示', txt.includes('ANTHROPIC_API_KEY'));
await page.goto(BASE + '/physics/practice', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /問題を作る/ }).click();
await page.waitForTimeout(2500);
check('演習: APIキー無しでエラーを日本語表示', (await page.textContent('body')).includes('ANTHROPIC_API_KEY'));

// Successful AI flows use deterministic browser fixtures; no live model is called.
let gradeCalls = 0;
let releaseGrade;
await page.route('**/api/physics-problem', async route => {
  const body = route.request().postDataJSON();
  if (body.action === 'generate') {
    await route.fulfill({ json: { problems: [{ id: 'p1', type: 'short', question: '回帰テスト問題', choices: [], answer: '2', explanation: '解説', hint: 'ヒント' }] } });
  } else {
    gradeCalls++;
    await new Promise(resolve => { releaseGrade = resolve; });
    await route.fulfill({ json: { correct: true, score: 100, feedback: '添削テスト完了', misconception: '' } });
  }
});
await page.goto(BASE + '/physics/practice?module=qm-ug-02', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /問題を作る/ }).click();
await page.getByText('回帰テスト問題', { exact: true }).waitFor();
await page.locator('textarea').fill('2');
await page.getByRole('button', { name: '採点する', exact: true }).click();
check('演習: 採点中の単元変更を禁止', await page.getByRole('combobox', { name: '単元' }).isDisabled());
check('演習: 採点中の再生成を禁止', await page.getByRole('button', { name: /問題を作る/ }).isDisabled());
await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('採点中')));
await waitForFixture(() => releaseGrade);
releaseGrade();
await page.getByText('添削テスト完了', { exact: true }).waitFor();
let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('physics.progress.v1')));
check('演習: 元の単元へ一度だけ記録', gradeCalls === 1 && saved.modules['qm-ug-02'].attempts === 1);
await page.getByRole('combobox', { name: '単元' }).selectOption('qinfo-ug-01');
check('演習: 単元変更で古い問題を消去', await page.getByText('回帰テスト問題', { exact: true }).count() === 0);
check('演習: 別単元への誤記録なし', !saved.modules['qinfo-ug-01']);
await page.getByRole('button', { name: /問題を作る/ }).click();
await page.getByText('回帰テスト問題', { exact: true }).waitFor();
await page.getByRole('button', { name: '解答を見る', exact: true }).click();
await page.locator('textarea').fill('2');
releaseGrade = null;
await page.getByRole('button', { name: '採点する', exact: true }).click();
await waitForFixture(() => releaseGrade);
releaseGrade();
await page.getByText('添削テスト完了', { exact: true }).waitFor();
saved = await page.evaluate(() => JSON.parse(localStorage.getItem('physics.progress.v1')));
check('演習: 解答を見た問題は習得判定に加算しない', !saved.modules['qinfo-ug-01']);
await page.unroute('**/api/physics-problem');

let tutorCalls = 0;
let releaseTutor;
await page.route('**/api/physics-tutor', async route => {
  tutorCalls++;
  if (tutorCalls === 2) await new Promise(resolve => { releaseTutor = resolve; });
  await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"text":"ストリーム回答 $x^2$"}\n\ndata: {"done":true}\n\ndata: [DONE]\n\n' }).catch(() => {});
});
await page.goto(BASE + '/physics/tutor', { waitUntil: 'networkidle' });
await page.locator('textarea').fill('日本語入力の変換中');
await page.locator('textarea').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true });
check('チューター: 日本語の変換確定で送信しない', tutorCalls === 0 && await page.locator('textarea').inputValue() === '日本語入力の変換中');
await page.getByRole('button', { name: '送信', exact: true }).click();
await page.getByText('ストリーム回答', { exact: false }).waitFor();
await page.getByRole('button', { name: '送信', exact: true }).waitFor();
check('チューター: 回答の数式を描画', await page.locator('.katex').count() > 0);
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('ストリーム回答', { exact: false }).waitFor();
check('チューター: 完了した会話を再読込できる', await page.getByText('ストリーム回答', { exact: false }).count() > 0);
await page.locator('textarea').fill('消去する会話');
await page.getByRole('button', { name: '送信', exact: true }).click();
await waitForFixture(() => releaseTutor);
await page.getByRole('button', { name: '会話を消す', exact: true }).click();
releaseTutor();
await page.reload({ waitUntil: 'networkidle' });
check('チューター: 消去後に遅い応答が会話を復活させない', await page.getByText('ストリーム回答', { exact: false }).count() === 0);
await page.unroute('**/api/physics-tutor');

// Invalid stored JSON shapes must not take down the application.
await page.evaluate(() => {
  localStorage.setItem('physics.tutor.v1', 'null');
  localStorage.setItem('physics.progress.v1', '{"modules":{"broken":null},"sessions":42}');
});
await page.goto(BASE + '/physics', { waitUntil: 'networkidle' });
check('進捗: 壊れた保存データから復帰', await page.locator('a[href^="/physics/module/"]').count() >= 2);
await page.goto(BASE + '/physics/tutor', { waitUntil: 'networkidle' });
check('チューター: 壊れた保存データから復帰', await page.locator('textarea').count() === 1);

// A measurement between two H gates removes the interference.
await page.goto(BASE + '/physics/lab/circuit', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: '1', exact: true }).click();
await page.getByRole('button', { name: 'H', exact: true }).click();
await page.getByRole('button', { name: 'ゲートを追加', exact: true }).click();
await page.getByRole('button', { name: '測定を追加', exact: true }).click();
await page.getByRole('button', { name: 'ゲートを追加', exact: true }).click();
txt = await page.textContent('body');
check('回路: H→測定→H の表示は50/50の混合状態', (txt.match(/50\.0%/g) || []).length === 2 && txt.includes('純度 Tr ρ² = 0.500'));
await page.screenshot({ path: `${SHOTS}/v-measurement.png` });

// ── モバイル幅で崩れないか
const mob = await ctx.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
for (const p of ['/physics', '/physics/curriculum', '/physics/module/qm-ug-02', '/physics/lab', '/physics/lab/circuit', '/physics/lab/bloch', '/physics/lab/well', '/physics/lab/tunnel', '/physics/lab/math', '/physics/tutor', '/physics/practice']) {
  await mob.goto(BASE + p, { waitUntil: 'networkidle' });
  await mob.waitForTimeout(500);
  const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`モバイル390px: 横スクロールが発生しない ${p}`, overflow <= 1, `はみ出し ${overflow}px`);
}
await mob.screenshot({ path: `${SHOTS}/v-mobile.png` });

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`);
if (failed.length) console.log('FAILED:\n' + failed.map((f) => ' - ' + f.name + (f.detail ? ` (${f.detail})` : '')).join('\n'));
// Only the exact missing-key endpoint responses are excluded above.
const realErrs = errs;
console.log(realErrs.length ? '\n実行時エラー:\n' + realErrs.join('\n') : '\n実行時エラーなし');
process.exitCode = failed.length || realErrs.length ? 1 : 0;
} finally {
  await browser.close();
}
