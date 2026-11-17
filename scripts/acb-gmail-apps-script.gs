/** Paste into https://script.google.com, enable the advanced Gmail API service.
 * Script Properties: FCFUND_ENDPOINT, FCFUND_API_KEY, FCFUND_MAILBOX,
 * ACB_SENDER, ACB_SUBJECT. See documents/18-cai-dat-gmail-acb.md.
 */
function syncAcbEmails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var endpoint = props.getProperty('FCFUND_ENDPOINT');
    var key = props.getProperty('FCFUND_API_KEY');
    var mailbox = (props.getProperty('FCFUND_MAILBOX') || '').toLowerCase();
    var sender = props.getProperty('ACB_SENDER') || 'mailalert@acb.com.vn';
    var subject = props.getProperty('ACB_SUBJECT') || 'ACB-Dich vu bao so du tu dong';
    if (!endpoint || !/^https:\/\//.test(endpoint) || !key || !mailbox) throw new Error('Missing Script Properties');
    if (Gmail.Users.getProfile('me').emailAddress.toLowerCase() !== mailbox) throw new Error('Wrong Gmail account');
    var token;
    var handled = 0;
    do {
      var batch = Gmail.Users.Messages.list('me', { q: 'newer_than:30d from:(' + sender + ')', maxResults: 50, pageToken: token });
      var messages = batch.messages || [];
      for (var i = 0; i < messages.length; i++) {
        var id = messages[i].id;
        if (props.getProperty('done_' + id)) continue;
        var metadata = Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Authentication-Results'] });
        var headers = metadata.payload.headers || [];
        var getHeader = function (name) { return headers.filter(function (h) { return h.name.toLowerCase() === name.toLowerCase(); }); };
        var actualSubject = (getHeader('Subject')[0] || {}).value || '';
        // Exact comparison; Gmail search alone is not an exact Subject match.
        if (actualSubject.normalize('NFC').trim() !== subject.normalize('NFC').trim()) continue;
        var authHeaders = getHeader('Authentication-Results').map(function (h) { return h.value; });
        // First Gmail authentication result, not arbitrary user-inserted headers.
        var trustedAuth = authHeaders.find(function (value) { return /^mx\.google\.com\s*;/i.test(value.trim()); });
        var payload = {
          messageId: id, mailbox: mailbox,
          receivedAt: new Date(Number(metadata.internalDate)).toISOString(),
          sender: (getHeader('From')[0] || {}).value || '', subject: actualSubject,
          body: GmailApp.getMessageById(id).getPlainBody(),
          authenticationResults: trustedAuth ? [trustedAuth] : []
        };
        var response = UrlFetchApp.fetch(endpoint, {
          method: 'post', contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(payload),
          muteHttpExceptions: true, followRedirects: false
        });
        var code = response.getResponseCode();
        if (code === 200) props.setProperty('done_' + id, String(Date.now()));
        else if (code === 401 || code === 403) throw new Error('FCFund connection rejected; check key and mode (' + code + ')');
        else if (code === 429 || code >= 500) return; // Retry automatically on the next scheduled run.
        else throw new Error('FCFund rejected payload (' + code + ')');
        handled++;
        if (handled >= 20) return;
      }
      token = batch.nextPageToken;
    } while (token);
    // Keep message checkpoints longer than the search window; server is the durable dedupe source.
    var all = props.getProperties();
    Object.keys(all).forEach(function (name) {
      if (name.indexOf('done_') === 0 && Number(all[name]) < Date.now() - 90 * 86400000) props.deleteProperty(name);
    });
  } finally { lock.releaseLock(); }
}

function installAcbTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'syncAcbEmails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('syncAcbEmails').timeBased().everyMinutes(5).create();
}
