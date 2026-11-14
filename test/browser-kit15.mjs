/**
 * Browser regression for kit 0.13 event visibility / raise.
 *
 * Requires Firefox + geckodriver and a live Node-RED with the internal-events
 * example imported (test-live.mjs does this).
 */
import assert from 'node:assert/strict'
import { sleep, startBrowser } from './browser-lib.mjs'

const MACHINE_ID = process.env.STATECHART_INTERNAL_MACHINE_ID || 'conf-internal-events'

const browser = await startBrowser()
try {
  await browser.setEditorLanguage('zh-CN')
  await browser.openConfig(MACHINE_ID)

  const tray = await browser.exec(`
    const box = document.querySelector('#scxml-editor-errors');
    return {
      notice: box && box.offsetParent !== null ? box.innerText : '',
      states: document.querySelectorAll('#scxml-states-body tr').length,
      transitions: document.querySelectorAll('#scxml-transitions-body tr').length,
    }
  `)
  assert.ok(tray.states >= 3, 'internal-events machine should have at least 3 states')
  assert.equal(tray.transitions, 3, 'internal-events machine should have 3 transitions')
  assert.match(tray.notice, /内部事件/)
  assert.match(tray.notice, /ping/)

  const eventTable = await browser.exec(`
    const row = document.querySelector('#scxml-events-body tr[data-event="ping"]');
    return {
      rows: document.querySelectorAll('#scxml-events-body tr').length,
      ping: row && row.querySelector('select[data-field=visibility]')
        ? row.querySelector('select[data-field=visibility]').value
        : '',
    }
  `)
  assert.ok(eventTable.rows >= 2, 'event visibility table should list arm/ack/ping')
  assert.equal(eventTable.ping, 'internal')

  const toggled = await browser.exec(`
    const row = document.querySelector('#scxml-events-body tr[data-event="ping"]');
    const select = row && row.querySelector('select[data-field=visibility]');
    if (!select) return { ok: false };
    select.value = 'both';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const box = document.querySelector('#scxml-editor-errors');
    return {
      ok: true,
      ping: document.querySelector('#scxml-events-body tr[data-event="ping"] select').value,
      notice: box && box.offsetParent !== null ? box.innerText : '',
    };
  `)
  assert.equal(toggled.ok, true)
  assert.equal(toggled.ping, 'both')
  assert.doesNotMatch(toggled.notice, /内部事件/)

  await browser.exec(`
    const row = document.querySelector('#scxml-events-body tr[data-event="ping"]');
    const select = row && row.querySelector('select[data-field=visibility]');
    if (!select) return false;
    select.value = 'internal';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `)
  await sleep(100)
  const restored = await browser.exec(`
    const row = document.querySelector('#scxml-events-body tr[data-event="ping"]');
    const box = document.querySelector('#scxml-editor-errors');
    return {
      ping: row && row.querySelector('select') ? row.querySelector('select').value : '',
      notice: box && box.offsetParent !== null ? box.innerText : '',
    };
  `)
  assert.equal(restored.ping, 'internal')
  assert.match(restored.notice, /内部事件/)

  const dialog = await browser.exec(`
    const button = document.querySelector('#scxml-transitions-body tr[data-id="t-arm"] .scxml-edit-actions');
    if (!button) return { clicked: false };
    button.click();
    const row = document.querySelector('#scxml-action-rows .scxml-action-row');
    const result = {
      clicked: true,
      rows: document.querySelectorAll('#scxml-action-rows .scxml-action-row').length,
      type: row && row.querySelector('[data-afield=type]') ? row.querySelector('[data-afield=type]').value : '',
      event: row && row.querySelector('[data-afield=event]') ? row.querySelector('[data-afield=event]').value : '',
      hasCode: !!(row && row.querySelector('[data-afield=code]')),
    };
    const cancel = document.querySelector('#scxml-action-cancel');
    if (cancel) cancel.click();
    return result;
  `)
  assert.equal(dialog.clicked, true, 't-arm action dialog should open')
  assert.equal(dialog.rows, 2, 't-arm has assign + raise')
  assert.equal(dialog.type, 'assign', 'the first action is assign')
  assert.equal(dialog.hasCode, false, 'raise must not render a script code field')

  // The first row is `assign lastEvent = "arm"`; inspect the second row for raise.
  const raiseRow = await browser.exec(`
    const button = document.querySelector('#scxml-transitions-body tr[data-id="t-arm"] .scxml-edit-actions');
    button.click();
    const rows = Array.from(document.querySelectorAll('#scxml-action-rows .scxml-action-row'));
    const row = rows[1];
    const result = {
      rows: rows.length,
      type: row && row.querySelector('[data-afield=type]') ? row.querySelector('[data-afield=type]').value : '',
      event: row && row.querySelector('[data-afield=event]') ? row.querySelector('[data-afield=event]').value : '',
      hasCode: !!(row && row.querySelector('[data-afield=code]')),
    };
    const cancel = document.querySelector('#scxml-action-cancel');
    if (cancel) cancel.click();
    return result;
  `)
  assert.equal(raiseRow.rows, 2)
  assert.equal(raiseRow.type, 'raise')
  assert.equal(raiseRow.event, 'ping')
  assert.equal(raiseRow.hasCode, false)

  await browser.navigate(browser.base)
  await browser.openConfig(MACHINE_ID)
  const parentHandle = (await browser.call('GET', '/window')).value
  await browser.exec(`document.querySelector('#node-config-input-open-full-editor').click(); return true`)

  let childHandle = ''
  const deadline = Date.now() + 15000
  while (!childHandle && Date.now() < deadline) {
    const open = await browser.handles()
    childHandle = open.find((handle) => handle !== parentHandle) || ''
    if (!childHandle) await sleep(200)
  }
  assert.ok(childHandle, 'standalone editor window did not open')
  await browser.switchWindow(childHandle)
  await browser.waitForSelector('.sce-root', 25000)
  await browser.waitFor(`return (document.body.innerText || '').includes('handling')`, 'internal-events chart', 20000)

  await browser.exec(`
    const tab = Array.from(document.querySelectorAll('.sce-tabs button')).find((b) => (b.textContent || '').trim() === '事件');
    if (!tab) return false;
    tab.click();
    return true;
  `)
  await sleep(250)
  const receive = await browser.exec(`
    const row = Array.from(document.querySelectorAll('.sce-events tbody tr')).find(
      (tr) => (tr.querySelector('td.name') || {}).textContent === 'ping'
        && tr.querySelector('input[type=checkbox]'),
    );
    if (!row) return null;
    const checkbox = row.querySelector('input[type=checkbox]');
    return {
      name: row.querySelector('td.name').textContent.trim(),
      internal: !!checkbox.checked,
      ariaLabel: checkbox.getAttribute('aria-label') || '',
      source: (row.querySelector('td.source') || {}).textContent || '',
    };
  `)
  assert.ok(receive, 'ping row should exist in the event panel')
  assert.equal(receive.internal, true)
  assert.match(receive.ariaLabel, /仅内部|internal-only/i)
  assert.match(receive.source, /内部|internal/)

  const emission = await browser.exec(`
    const section = Array.from(document.querySelectorAll('.sce-events .sce-event-section')).find(
      (el) => ((el.querySelector('h4') || {}).textContent || '').includes('内部发出'),
    );
    return section ? { text: section.innerText } : null;
  `)
  assert.ok(emission, 'kit 0.15 internal-emission section should exist')
  assert.match(emission.text, /ping/)
  assert.match(emission.text, /1/)

  console.log(JSON.stringify({ ok: true, tray, dialog, raiseRow, receive, emission }, null, 2))
} finally {
  await browser.close()
}
