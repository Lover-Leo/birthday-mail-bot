const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {birthdayPersonaPatches, upgradeBirthdayPersona} = require('./persona_upgrade.cjs');
const current = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const old = birthdayPersonaPatches.reduce((code, patch) => code.replace(patch.after, patch.before), current);
const privatePrefix = '// 私人名单以 Google 为准，不从本机导出\nconst BIRTHDAY_DATA = ' + JSON.stringify({
  ownerEmail: 'changed-owner@gmail.com', recipients: [{name: '云端新收件人', email: 'cloud-only@domain.test'}],
  people: [{id: 'remote-only', name: '云端新寿星', birthday: '03-05'}], sendAt: '10:15', localHistory: []
}, null, 2) + ';\n\n';

test('upgrading a complete old birthday file preserves its cloud-only data prefix byte for byte', () => {
  const result = upgradeBirthdayPersona(privatePrefix + old);
  assert.equal(result.changes, 3);
  assert.equal(result.code, privatePrefix + current);
  new vm.Script(result.code);
});

test('repeated or partial updates are safe and idempotent', () => {
  const ready = upgradeBirthdayPersona(privatePrefix + current);
  assert.equal(ready.changes, 0);
  assert.equal(ready.code, privatePrefix + current);
  const partial = old.replace(birthdayPersonaPatches[0].before, birthdayPersonaPatches[0].after);
  assert.equal(upgradeBirthdayPersona(privatePrefix + partial).code, privatePrefix + current);
});

test('wrong files and unknown edits fail without producing replacement code', () => {
  assert.throws(() => upgradeBirthdayPersona(''), /先把 Google/);
  assert.throws(() => upgradeBirthdayPersona(current), /不像完整的生日代码/);
  assert.throws(() => upgradeBirthdayPersona(privatePrefix + old.replace('function message_(reminders, today)', 'function customized_(items, date)')), /已停止修改/);
  assert.throws(() => upgradeBirthdayPersona(privatePrefix + old + '\n' + old), /已停止修改/);
});

test('Windows line endings are handled without changing field values', () => {
  const result = upgradeBirthdayPersona((privatePrefix + old).replace(/\n/g, '\r\n'));
  assert.equal(result.code, privatePrefix + current);
});

test('the offline helper embeds the latest chat code and its script compiles', () => {
  const html = fs.readFileSync(path.join(__dirname, '小鲸鱼更新助手.html'), 'utf8');
  assert.doesNotMatch(html, /<script[^>]+src=|<iframe|<form/i);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  new vm.Script(script);
  const ai = fs.readFileSync(path.join(__dirname, 'AIMail.gs'), 'utf8');
  const sandbox = {document: {getElementById: () => ({value: '', addEventListener() {}})}};
  vm.createContext(sandbox);
  vm.runInContext(script + '\nglobalThis.capturedAi = aiSource;', sandbox);
  assert.equal(sandbox.capturedAi, ai);
  assert.equal(sandbox.upgradeBirthdayPersona(privatePrefix + old).code, privatePrefix + current);
});

test('the recipients helper copies the latest code and only asks to update AIMail before activating access', () => {
  const html = fs.readFileSync(path.join(__dirname, '收件人聊天更新助手.html'), 'utf8');
  const markup = html.split('<script>')[0];
  assert.match(markup, /enableRecipientAiMail/);
  assert.match(markup, /otherReplyCopyTo/);
  assert.match(markup, /密送/);
  assert.doesNotMatch(markup, /id="birthdayCode"|id="copyBirthday"|<script[^>]+src=|<iframe|<form/i);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const aiBox = {value: ''};
  const sandbox = {document: {getElementById: id => id === 'aiCode' ? aiBox : id === 'copyAi' ? {addEventListener() {}} : null}};
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  assert.equal(aiBox.value, fs.readFileSync(path.join(__dirname, 'AIMail.gs'), 'utf8'));
});
