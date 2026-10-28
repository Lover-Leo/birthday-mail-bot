const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function environment(changes = {}) {
  const data = {
    ownerEmail: 'owner@gmail.com', senderName: '生日提醒', sendAt: '09:00',
    remindDays: [0], leapDayPolicy: 'feb28',
    people: [{id: '1', name: '甲', birthday: '10-27'}, {id: '2', name: '乙', birthday: '10-27'}],
    recipients: [{name: 'A', email: 'a@domain.test'}, {name: 'B', email: 'b@domain.test'}],
    localHistory: [], ...changes
  };
  const state = {properties: new Map(), mails: [], failures: new Set(), triggers: [], quota: 100,
                 lockBusy: false, releases: 0, account: data.ownerEmail};
  const store = {
    getProperty: key => state.properties.get(key) ?? null,
    setProperty: (key, value) => state.properties.set(key, String(value))
  };
  const sandbox = {
    console: {log() {}, error() {}},
    PropertiesService: {getScriptProperties: () => store},
    Session: {getEffectiveUser: () => ({getEmail: () => state.account})},
    LockService: {getScriptLock: () => ({
      tryLock: () => !state.lockBusy,
      waitLock: () => { if (state.lockBusy) throw new Error('lock busy'); },
      releaseLock: () => { state.releases++; }
    })},
    ScriptApp: {
      getProjectTriggers: () => [...state.triggers],
      deleteTrigger: trigger => { state.triggers = state.triggers.filter(item => item !== trigger); },
      newTrigger: handler => {
        let minutes;
        const builder = {
          timeBased() { return builder; },
          everyMinutes(value) { minutes = value; return builder; },
          create() {
            const trigger = {getHandlerFunction: () => handler, interval: minutes};
            state.triggers.push(trigger);
            return trigger;
          }
        };
        return builder;
      }
    },
    MailApp: {
      getRemainingDailyQuota: () => state.quota,
      sendEmail: message => {
        if (state.failures.delete(message.to)) throw new Error('temporary send failure');
        state.mails.push(plain(message));
        state.quota--;
      }
    },
    Utilities: {formatDate: (value, zone, format) => {
      assert.equal(zone, 'Asia/Shanghai');
      const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(value).map(item => [item.type, item.value]));
      return format === 'HH:mm' ? `${values.hour}:${values.minute}` : `${values.year}-${values.month}-${values.day}`;
    }}
  };
  vm.createContext(sandbox);
  vm.runInContext('const BIRTHDAY_DATA = ' + JSON.stringify(data) + ';\n' + source, sandbox);
  return {api: sandbox, state};
}

const birthdayMorning = new Date('2026-10-27T01:05:00Z');
function enabled(changes) {
  const env = environment(changes);
  env.api.setupCloud();
  return env;
}

test('cross-year reminders use the upcoming event year', () => {
  const {api} = environment({people: [{id: '1', name: '元旦', birthday: '01-01'}], remindDays: [3, 0]});
  const result = plain(api.remindersFor_('2026-12-29'));
  assert.equal(result.length, 1);
  assert.equal(result[0].birthday, '2027-01-01');
  assert.equal(result[0].leadDays, 3);
});

test('leap day follows all three policies', () => {
  const {api} = environment();
  assert.equal(api.observedBirthday_('02-29', 2027, 'feb28'), '2027-02-28');
  assert.equal(api.observedBirthday_('02-29', 2027, 'mar01'), '2027-03-01');
  assert.equal(api.observedBirthday_('02-29', 2027, 'strict'), null);
  assert.equal(api.observedBirthday_('02-29', 2028, 'strict'), '2028-02-29');
});

test('invalid dates and duplicate person IDs stop setup', () => {
  assert.throws(() => environment({people: [{id: '1', name: '甲', birthday: '02-30'}]}).api.checkSetup(), /无效公历日期/);
  assert.throws(() => environment({people: [{id: '1', name: '甲', birthday: '01-01'}, {id: '1', name: '乙', birthday: '02-02'}]}).api.checkSetup(), /重复/);
});

test('wrong Google account cannot enable or send', () => {
  const {api, state} = environment();
  state.account = 'another@gmail.com';
  assert.throws(() => api.setupCloud(), /请使用/);
  assert.equal(state.triggers.length, 0);
  assert.equal(state.mails.length, 0);
});

test('setup validates permissions without sending and installs exactly one trigger', () => {
  const {api, state} = environment();
  const result = api.setupCloud();
  assert.equal(result.enabled, true);
  assert.equal(state.triggers.length, 1);
  assert.equal(state.triggers[0].interval, 15);
  assert.equal(state.mails.length, 0);
  api.setupCloud();
  assert.equal(state.triggers.length, 1);
});

test('disabled and pre-09:00 runs send nothing', () => {
  const {api, state} = environment();
  assert.equal(api.runAt_(birthdayMorning).reason, 'disabled');
  api.setupCloud();
  assert.equal(api.runAt_(new Date('2026-10-27T00:59:00Z')).reason, 'before_send_time');
  assert.equal(state.mails.length, 0);
});

test('multiple birthdays are combined and each recipient gets a private email', () => {
  const {api, state} = enabled();
  assert.equal(api.runAt_(birthdayMorning).sent, 2);
  assert.equal(state.mails.length, 2);
  assert.match(state.mails[0].subject, /甲、乙/);
  assert.deepEqual(state.mails.map(mail => mail.to), ['a@domain.test', 'b@domain.test']);
  assert.equal('cc' in state.mails[0], false);
  assert.equal('bcc' in state.mails[0], false);
});

test('persistent properties suppress repeated runs', () => {
  const {api, state} = enabled();
  api.runAt_(birthdayMorning);
  const result = api.runAt_(new Date('2026-10-27T01:30:00Z'));
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 2);
  assert.equal(state.mails.length, 2);
});

test('a failed recipient is retried without resending successful recipients', () => {
  const {api, state} = enabled();
  state.failures.add('b@domain.test');
  assert.throws(() => api.runAt_(birthdayMorning), /1 位收件人/);
  assert.equal(state.mails.length, 1);
  const result = api.runAt_(birthdayMorning);
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(state.mails.map(mail => mail.to), ['a@domain.test', 'b@domain.test']);
});

test('imported local history suppresses the corresponding emails', () => {
  const history = ['1', '2'].map(personId => ({personId, birthday: '2026-10-27', leadDays: 0,
    recipient: 'a@domain.test', sentAt: '2026-10-27T09:00:00+08:00'}));
  const {api, state} = enabled({localHistory: history});
  const result = api.runAt_(birthdayMorning);
  assert.equal(result.sent, 1);
  assert.equal(result.skipped, 1);
  assert.equal(state.mails[0].to, 'b@domain.test');
});

test('quota exhaustion preserves pending events', () => {
  const {api, state} = enabled();
  state.quota = 0;
  assert.throws(() => api.runAt_(birthdayMorning), /2 位收件人/);
  assert.equal([...state.properties.keys()].some(key => key.startsWith('sent_v1:')), false);
  state.quota = 10;
  assert.equal(api.runAt_(birthdayMorning).sent, 2);
});

test('a busy script lock prevents overlap', () => {
  const {api, state} = enabled();
  state.lockBusy = true;
  assert.equal(api.runAt_(birthdayMorning).reason, 'another_run_is_active');
  assert.equal(state.mails.length, 0);
});

test('recipient duplicates are ignored', () => {
  const {api, state} = enabled({recipients: [{name: 'A', email: 'a@domain.test'}, {name: 'A2', email: 'A@domain.test'}]});
  assert.equal(api.runAt_(birthdayMorning).sent, 1);
  assert.equal(state.mails.length, 1);
});

test('next year is a new birthday event', () => {
  const {api, state} = enabled();
  api.runAt_(birthdayMorning);
  assert.equal(api.runAt_(new Date('2027-10-27T01:05:00Z')).sent, 2);
  assert.equal(state.mails.length, 4);
});

test('no birthday means no outgoing message', () => {
  const {api, state} = enabled();
  assert.equal(api.runAt_(new Date('2026-10-28T01:05:00Z')).sent, 0);
  assert.equal(state.mails.length, 0);
});

test('disabling cloud retains delivery history', () => {
  const {api, state} = enabled();
  api.runAt_(birthdayMorning);
  api.disableCloud();
  assert.equal(state.triggers.length, 0);
  assert.equal(api.runAt_(birthdayMorning).reason, 'disabled');
  api.setupCloud();
  assert.equal(api.runAt_(birthdayMorning).skipped, 2);
});

test('the explicitly requested test email goes only to the owner', () => {
  const {api, state} = environment();
  api.sendTestToOwner();
  assert.deepEqual(state.mails.map(mail => mail.to), ['owner@gmail.com']);
  assert.equal([...state.properties.keys()].some(key => key.startsWith('sent_v1:')), false);
});

test('the example deployment compiles without private configuration or SMTP credentials', () => {
  const combined = fs.readFileSync(path.join(__dirname, 'Data.example.gs'), 'utf8') + '\n' + source;
  new vm.Script(combined);
  assert.doesNotMatch(combined, /"password"\s*:|"smtp"\s*:/);
  const privateExport = path.join(__dirname, 'ReadyToPaste.gs');
  if (fs.existsSync(privateExport)) {
    const generated = fs.readFileSync(privateExport, 'utf8');
    new vm.Script(generated);
    assert.doesNotMatch(generated, /"password"\s*:|"smtp"\s*:/);
  }
});
