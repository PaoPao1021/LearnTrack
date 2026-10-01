/* Regression checks in an isolated browser database; requires the Vite dev server. */
const { chromium } = require(process.env.LT_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.LT_BROWSER_PATH ? { executablePath: process.env.LT_BROWSER_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    page.on('pageerror', e => errors.push(e.message));
    const origin = process.env.LT_PREVIEW_ORIGIN || 'http://127.0.0.1:5183';
    await page.goto(`${origin}/practice`);
    await page.getByLabel('原书题号 / 力扣题号').fill('高数·极限·A07');
    await page.getByLabel('备注 / 错因').fill('尚未保存的解题思路');
    await page.getByLabel('用时（秒）').fill('127');
    await page.getByRole('button', { name: /^待复习/ }).click();
    await page.getByRole('button', { name: '练习记录', exact: true }).click();
    assert.equal(await page.getByLabel('原书题号 / 力扣题号').inputValue(), '高数·极限·A07');
    assert.equal(await page.getByLabel('用时（秒）').inputValue(), '127');
    assert.equal(await page.getByLabel('备注 / 错因').inputValue(), '尚未保存的解题思路');
    await page.getByRole('button', { name: '计时', exact: true }).click();
    // Simulate elapsed time while the page is closed, without a wall-clock wait.
    await page.evaluate(() => {
      const key = 'learntrack.practice.draft.v1.zhangyu-2027-math1-1000.new';
      const draft = JSON.parse(sessionStorage.getItem(key));
      draft.startedAt -= 10000;
      sessionStorage.setItem(key, JSON.stringify(draft));
    });
    await page.reload();
    await page.getByRole('button', { name: /^停止 / }).click();
    assert.ok(Number(await page.getByLabel('用时（秒）').inputValue()) >= 137);
    await page.evaluate(async () => {
      const { saveAttempt } = await import('/src/services/study.ts');
      await saveAttempt({ source: 'leetcode', chapterKey: 'dp', questionKey: '70 爬楼梯', result: 'incorrect', durationSeconds: 180, learningDate: '2026-09-01', note: '边界条件' });
    });
    await page.goto(`${origin}/`);
    await page.getByRole('link', { name: '待复习 1 题', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('tab'), 'review');
    assert.equal(await page.getByLabel('练习资料').inputValue(), 'all');
    await page.getByText('70 爬楼梯', { exact: true }).waitFor();
    fs.mkdirSync('output/playwright', { recursive: true });
    await page.screenshot({ path: 'output/playwright/review-queue-desktop.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: '再练一次', exact: true }).click();
    const retryId = new URL(page.url()).searchParams.get('repeat');
    assert.ok(retryId);
    await page.getByLabel('备注 / 错因').fill('重做已核对边界');
    await page.reload();
    await page.getByRole('heading', { name: '重做：70 爬楼梯', exact: true }).waitFor();
    assert.equal(await page.getByLabel('练习资料').inputValue(), 'leetcode');
    assert.equal(await page.getByLabel('备注 / 错因').inputValue(), '重做已核对边界');
    await page.getByRole('button', { name: '保存练习', exact: true }).click();
    await page.getByRole('heading', { name: '记一道题', exact: true }).waitFor();
    assert.equal(await page.evaluate(id => sessionStorage.getItem(`learntrack.practice.draft.v1.leetcode.${id}`), retryId), null);
    await page.getByLabel('练习资料').selectOption('zhangyu-2027-math1-1000');
    assert.equal(await page.getByLabel('原书题号 / 力扣题号').inputValue(), '高数·极限·A07');
    await page.goto(`${origin}/`);
    await page.getByRole('link', { name: '待复习 0 题', exact: true }).waitFor();
    const second = await context.newPage();
    await second.goto(`${origin}/`);
    await second.getByRole('heading', { name: '今日待办', exact: true }).waitFor();
    await page.evaluate(async () => {
      const { db } = await import('/src/db/database.ts');
      const { useTimer, syncFromStorage, TIMER_STORAGE_KEY } = await import('/src/stores/timer.ts');
      const activity = await db.categories.filter(c => c.level === 'activity' && !c.deletedAt).first();
      useTimer.getState().start(activity.id, 'multi-tab review');
      const state = JSON.parse(localStorage.getItem(TIMER_STORAGE_KEY));
      state.startedAt -= 60000;
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state));
      syncFromStorage(state);
    });
    await second.waitForFunction(async () => (await import('/src/stores/timer.ts')).useTimer.getState().status === 'running');
    const stopped = await Promise.all([page, second].map(p => p.evaluate(async () => (await import('/src/stores/timer.ts')).useTimer.getState().stop())));
    assert.equal(stopped.filter(Boolean).length, 1);
    assert.equal(await page.evaluate(async () => (await import('/src/db/database.ts')).db.entries.count()), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: draft navigation/reload with elapsed time, cross-source due queue and retry recovery, independent draft clearing, and multi-tab timer deduplication.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
