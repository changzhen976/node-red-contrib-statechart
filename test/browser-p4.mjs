/**
 * Standalone kit-editor browser test.
 *
 * Requires Firefox + geckodriver and a live Node-RED (same env as test:browser).
 * Opens the full-page editor, saves back into the parent config node and closes
 * the window. Nothing is deployed.
 */
import assert from 'node:assert/strict'
import { sleep, startBrowser } from './browser-lib.mjs'

const MACHINE_ID = process.env.STATECHART_MACHINE_ID || 'scxml-conf-traffic'

const browser = await startBrowser()
try {
  await browser.setEditorLanguage('zh-CN')
  await browser.openConfig(MACHINE_ID)
  const parentHandle = (await browser.call('GET', '/window')).value

  await browser.exec(`document.querySelector('#node-config-input-open-full-editor').click(); return true`)
  const childDeadline = Date.now() + 15000
  let childHandle = ''
  while (!childHandle && Date.now() < childDeadline) {
    const open = await browser.handles()
    childHandle = open.find((handle) => handle !== parentHandle) || ''
    if (!childHandle) await sleep(200)
  }
  assert.ok(childHandle, 'standalone editor window did not open')

  await browser.switchWindow(childHandle)
  await browser.waitForSelector('.sce-root', 25000)
  await browser.waitFor(`return (document.body.innerText || '').includes('green')`, 'kit editor content', 20000)
  const child = await browser.exec(`return {
    root: !!document.querySelector('.sce-root'),
    text: (document.body.innerText || '').slice(0, 1200),
    title: document.title,
  }`)
  assert.equal(child.root, true, 'kit editor did not mount')
  assert.match(child.text, /red/)
  assert.match(child.text, /green/)

  await browser.waitFor(`return Array.from(document.querySelectorAll('input')).some((el) => el.type === 'text')`, 'editor inputs', 10000)

  // Make the document dirty so a save is actually attempted.
  const renamed = await browser.exec(`
    const input = Array.from(document.querySelectorAll('input')).find((el) => el.type === 'text');
    if (!input) return 'NO_INPUT';
    input.value = 'Traffic Light E2E';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return 'CHANGED';
  `)
  assert.equal(renamed, 'CHANGED')
  await browser.waitFor(`return document.title.indexOf('●') === 0`, 'dirty marker after rename', 5000)

  const beforeLen = await browser.exec(`
    const node = window.opener.RED.nodes.node(arguments[0]);
    return node && node.doc ? node.doc.length : 0;
  `, [MACHINE_ID])

  // Drop child -> parent messages: save must time out instead of closing with
  // an unconfirmed write.
  const blocked = await browser.exec(`
    window.__scPostMessage = window.opener.postMessage;
    window.opener.postMessage = function () {};
    return window.opener.postMessage === window.__scPostMessage ? 'NOT_BLOCKED' : 'BLOCKED';
  `)
  assert.equal(blocked, 'BLOCKED', 'save ACK test must block postMessage')

  const blockedSave = await browser.exec(`
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '保存到 Node-RED');
    if (!button) return 'NO_BUTTON';
    button.click();
    return 'CLICKED';
  `)
  assert.equal(blockedSave, 'CLICKED')
  await sleep(2200)
  const afterBlocked = await browser.exec(`
    const node = window.opener.RED.nodes.node(arguments[0]);
    return {
      parentLen: node && node.doc ? node.doc.length : 0,
      dirty: document.title.indexOf('●') === 0,
      title: document.title,
    };
  `, [MACHINE_ID])
  assert.equal(afterBlocked.parentLen, beforeLen, 'a timed-out save must not update the parent document')
  assert.equal(afterBlocked.dirty, true, 'a failed save must keep the editor dirty')

  const restored = await browser.exec(`
    window.opener.postMessage = window.__scPostMessage;
    return window.opener.postMessage === window.__scPostMessage ? 'RESTORED' : 'NOT_RESTORED';
  `)
  assert.equal(restored, 'RESTORED')

  const save = await browser.exec(`
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '保存到 Node-RED');
    if (!button) return 'NO_BUTTON';
    button.click();
    return 'CLICKED';
  `)
  assert.equal(save, 'CLICKED')
  await browser.waitFor(`return document.title.indexOf('●') !== 0`, 'dirty marker cleared after save', 8000)

  await browser.switchWindow(parentHandle)
  const parent = await browser.waitFor(`return (() => {
    const node = RED.nodes.node(arguments[0]);
    if (!node) return null;
    let doc = null;
    try { doc = JSON.parse(node.doc) } catch {}
    if (!doc || !Array.isArray(doc.states) || doc.states.length < 3) return null;
    return { docLen: node.doc.length, states: doc.states.length, docName: doc.name, nodeName: node.name };
  })()`, 'parent node.doc update', 10000, [MACHINE_ID])
  assert.ok(parent.docLen > 0, 'parent node.doc was not updated by the standalone editor')
  assert.ok(parent.states >= 3, 'parent node.doc does not contain the loaded states')
  assert.equal(parent.docName, 'Traffic Light E2E')
  assert.equal(parent.docName, parent.nodeName, 'document name and config-node name must stay in sync')

  await browser.switchWindow(childHandle)
  const dirtyTitle = await browser.exec(`return document.title`)
  assert.ok(!String(dirtyTitle).startsWith('●'), 'saving must clear the kit dirty marker')

  const close = await browser.exec(`
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '关闭');
    if (!button) return 'NO_BUTTON';
    button.click();
    return 'CLICKED';
  `)
  assert.equal(close, 'CLICKED')
  const deadline = Date.now() + 8000
  let remaining = await browser.handles()
  while (remaining.includes(childHandle) && Date.now() < deadline) {
    await sleep(200)
    remaining = await browser.handles()
  }
  assert.ok(!remaining.includes(childHandle), 'editor window did not close')

  console.log(JSON.stringify({
    ok: true,
    title: child.title,
    parentDocLen: parent.docLen,
    parentStates: parent.states,
    machineName: parent.nodeName,
  }, null, 2))

  // Discard the unsaved parent config dialog; never deploys.
  await browser.switchWindow(parentHandle)
  await browser.navigate(browser.base)
} finally {
  await browser.close()
}
