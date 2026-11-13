/**
 * Node-RED editor browser smoke test.
 *
 * Requires Firefox + geckodriver and a live Node-RED with the package loaded:
 *
 *   GECKODRIVER=/path/to/geckodriver \
 *   NODERED_URL=http://localhost:1880/ \
 *   npm run test:browser
 *
 * The test opens the tray editor read-only: it never clicks Update/Deploy.
 */
import assert from 'node:assert/strict'
import { sleep, startBrowser } from './browser-lib.mjs'

const MACHINE_ID = process.env.STATECHART_MACHINE_ID || 'scxml-conf-traffic'

const browser = await startBrowser()
try {
  await browser.setEditorLanguage('zh-CN')
  await browser.openConfig(MACHINE_ID)

  const ui = await browser.exec(`
    const node = RED.nodes.node(arguments[0]);
    return {
      lang: RED.i18n.lang(),
      nameLabel: document.querySelector('#node-config-input-name').closest('.form-row').querySelector('label').innerText,
      buttons: Array.from(document.querySelectorAll('.scxml-editor-toolbar button')).map((b) => b.innerText),
      states: document.querySelectorAll('#scxml-states-body tr').length,
      transitions: document.querySelectorAll('#scxml-transitions-body tr').length,
      vars: document.querySelectorAll('#scxml-vars-body tr').length,
      errorVisible: !!document.querySelector('#scxml-editor-errors') && document.querySelector('#scxml-editor-errors').offsetParent !== null,
      statusText: node ? node._('status.notStarted') : null,
    }
  `, [MACHINE_ID])
  assert.equal(ui.lang, 'zh-CN')
  assert.match(ui.nameLabel, /名称/)
  assert.equal(ui.statusText, '未启动')
  assert.ok(ui.buttons.some((text) => text.includes('状态')))
  assert.ok(ui.states >= 1, 'expected at least one state')
  assert.ok(ui.transitions >= 1, 'expected at least one transition')
  assert.ok(ui.vars >= 1, 'expected at least one variable')
  assert.equal(ui.errorVisible, false, 'valid traffic machine should have no errors')

  // Tray editor action dialog: open, inspect and close in one command so the
  // modal never sits between two WebDriver calls.
  const dialog = await browser.exec(`
    const button = document.querySelector('#scxml-states-body .scxml-edit-actions[data-field=entry]');
    if (!button) return { clicked: false };
    button.click();
    const dialog = document.querySelector('#scxml-action-dialog');
    const result = {
      clicked: true,
      open: !!dialog && dialog.open,
      rows: document.querySelectorAll('#scxml-action-rows .scxml-action-row').length,
    };
    const cancel = document.querySelector('#scxml-action-cancel');
    if (cancel) cancel.click();
    return result;
  `)
  assert.equal(dialog.clicked, true, 'an entry action edit button should exist')
  assert.equal(dialog.open, true, 'actions dialog should open')
  assert.ok(dialog.rows >= 1, 'entry action should be parsed into a row')

  await browser.exec(`RED.sidebar.show('context'); return true`)
  await sleep(250)
  await browser.exec(`RED.sidebar.show('scxml-monitor'); return true`)
  await sleep(350)
  const sidebarUi = await browser.exec(`return {
    banner: Array.from(document.querySelectorAll('.red-ui-sidebar-banner-label')).filter((e) => e.offsetParent !== null).map((e) => e.innerText),
    icon: (document.querySelector('button[data-tab-id="scxml-monitor"] i') || {}).className || '',
  }`)
  assert.ok(sidebarUi.banner.includes('状态机监控'), 'sidebar banner should switch to 状态机监控')
  assert.match(sidebarUi.icon, /fa-sitemap/)

  await browser.exec(`document.querySelector('#node-config-input-open-sidebar').click(); return true`)
  const monitorSrc = await browser.waitFor(
    `return Array.from(document.querySelectorAll('iframe')).map((f) => f.src).find((src) => src.includes('/statechart/monitor')) || ''`,
    'sidebar monitor iframe',
    10000,
  )
  assert.match(monitorSrc, /[?&]token=/, 'sidebar monitor iframe must carry a capability token')

  await browser.waitFor(`return (() => {
    const frame = Array.from(document.querySelectorAll('iframe')).find((f) => f.src.includes('/statechart/monitor'));
    const doc = frame && frame.contentDocument;
    const view = doc && doc.getElementById('view');
    const edit = doc && doc.getElementById('edit');
    return !!(view && view.shadowRoot && view.shadowRoot.querySelector('.diagram') && edit && !edit.hidden && !edit.disabled);
  })()`, 'monitor camera and edit button', 15000)

  const monitor = await browser.exec(`return (() => {
    const frame = Array.from(document.querySelectorAll('iframe')).find((f) => f.src.includes('/statechart/monitor'));
    const doc = frame.contentDocument;
    const view = doc.getElementById('view');
    const diagram = view.shadowRoot.querySelector('.diagram');
    const label = doc.getElementById('zoom-label');
    const win = frame.contentWindow;
    const before = diagram.style.transform || '';
    view.dispatchEvent(new win.WheelEvent('wheel', {
      deltaY: -120, ctrlKey: true, clientX: 120, clientY: 120, bubbles: true, cancelable: true,
    }));
    const afterZoom = diagram.style.transform || '';
    const afterLabel = label.textContent;
    view.dispatchEvent(new win.PointerEvent('pointerdown', {
      button: 0, pointerId: 1, clientX: 120, clientY: 120, bubbles: true, cancelable: true,
    }));
    win.dispatchEvent(new win.PointerEvent('pointermove', {
      pointerId: 1, clientX: 160, clientY: 150, bubbles: true, cancelable: true,
    }));
    win.dispatchEvent(new win.PointerEvent('pointerup', {
      pointerId: 1, clientX: 160, clientY: 150, bubbles: true, cancelable: true,
    }));
    const afterPan = diagram.style.transform || '';
    return { before, afterZoom, afterPan, afterLabel };
  })()`)
  assert.notEqual(monitor.afterZoom, monitor.before, 'Ctrl+wheel must change the diagram transform')
  assert.match(monitor.afterZoom, /scale\(/, 'Ctrl+wheel must apply a scale transform')
  assert.notEqual(monitor.afterPan, monitor.afterZoom, 'pointer drag must change the diagram transform')
  assert.match(monitor.afterLabel, /%$/, 'zoom readout must show a percentage')

  const editUrl = await browser.exec(`return (() => {
    const frame = Array.from(document.querySelectorAll('iframe')).find((f) => f.src.includes('/statechart/monitor'));
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    win.open = (url) => { win.__scxmlOpened = url; return { closed: false, focus() {} }; };
    doc.getElementById('edit').click();
    return win.__scxmlOpened || '';
  })()`)
  assert.match(editUrl, /\/statechart\/editor\//, 'edit button must open the full editor')
  assert.match(editUrl, new RegExp(`[?&]id=${encodeURIComponent(MACHINE_ID)}(?:&|$)`), 'editor URL must carry the machine id')
  assert.match(editUrl, /[?&]host=top(?:&|$)/, 'editor URL must target the top Node-RED window')
  assert.match(editUrl, /[?&]token=/, 'editor URL must carry the capability token')

  // Duplicate ids must surface the client-side validation box.
  const duplicate = await browser.exec(`
    const inputs = Array.from(document.querySelectorAll('#scxml-states-body [data-field=id]'));
    if (inputs.length < 2) return 'SKIP';
    inputs[1].value = inputs[0].value;
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
    return 'DONE';
  `)
  if (duplicate === 'DONE') {
    const issue = await browser.waitFor(`return (() => {
      const box = document.querySelector('#scxml-editor-errors');
      return box && box.offsetParent !== null && box.innerText.includes('重复') ? box.innerText : '';
    })()`, 'duplicate id validation', 5000).catch(() => '')
    assert.match(String(issue), /重复/, 'duplicate id should display the error box')
  }

  // Discard the unsaved editor mutation; never clicks Update/Deploy.
  await browser.navigate(browser.base)
  console.log(JSON.stringify({
    ok: true,
    lang: ui.lang,
    states: ui.states,
    transitions: ui.transitions,
    vars: ui.vars,
    actionsRows: dialog.rows,
    duplicateCheck: duplicate,
  }, null, 2))
} finally {
  await browser.close()
}
