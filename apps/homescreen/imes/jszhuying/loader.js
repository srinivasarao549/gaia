/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Code for IMEngines to register itself
IMEManager.IMEngines.jszhuying = {
  init: function jszhuying_init(glue) {
    this.mobi = JSZhuYing.Mobi(glue);
  },

  click: function jszhuying_init(keyCode) {
    this.mobi.keypress(keyCode);
  },

  select: function jszhuying_select(selection, selectionData) {
    this.mobi.select(selection, selectionData);
  },

  empty: function jszhuying_empty() {
    this.mobi.empty();
  }
};

// XXX: Should _not_ pollute global scope of homescreen.html
// IMEs should be a isolated keyboard application someday.
var JSZhuYing = function JSZhuYing(settings) {
  settings = settings  || {};

  // XXX This is dirty.
  if (!settings.progress) {
    settings.progress = function settingsProgress() {};
  }
  if (!settings.ready) {
    settings.ready = function settingsReady() {};
  }

  var debugging = false;
  var debug = function(str) {
    if (debugging)
      dump(str + '\n');
  };

  var version = '0.1';
  var dbName = 'JSZhuYing';
  var dbVersion = 6;
  var jsonData;
  var cache = {};
  var cacheTimer;
  var db;

  var init = function() {
    var self = this;
    if (settings.disableIndexedDB) {
      settings.progress.call(self, 'IndexedDB disabled; Downloading JSON ...');
      debug('JSZhuYing: IndexedDB disabled; Downloading JSON ...');
      getTermsJSON(
        function() {
          settings.ready.call(self);
          debug('JSZhuYing: Ready.');
        }
      );
      return;
    }
    settings.progress.call(self, 'Probing IndexedDB ...');
    debug('JSZhuYing: Probing IndexedDB ...');
    getTermsInDB(
      function() {
        if (!db) {
          settings.progress.call(self, 'IndexedDB not available; Downloading JSON ...');
          debug('JSZhuYing: IndexedDB not available; Downloading JSON ...');
          getTermsJSON(
            function() {
              settings.ready.call(self);
              debug('JSZhuYing: Ready.');
            }
          );
          return;
        }
        var transaction = db.transaction('terms'),
        req = transaction.objectStore('terms').get('_last_entry_');
        req.onsuccess = function(ev) {
          if (ev.target.result !== undefined) {
            settings.ready.call(self);
            return;
          }
          settings.progress.call(self, 'IndexedDB is supported but empty; Downloading JSON ...');
          debug('JSZhuYing: IndexedDB is supported but empty; Downloading JSON ...');
          getTermsJSON(
            function() {
              if (!jsonData)
                return;
              settings.ready.call(self);
              settings.progress.call(self, 'JSON downloaded, IME is ready to use while inserting data into db ...');
              debug('JSZhuYing: JSON downloaded, IME is ready to use while inserting data into db ...');
              populateDBFromJSON(
                function() {
                  settings.progress.call(self, 'indexedDB ready and switched to indexedDB backend.');
                  debug('JSZhuYing: indexedDB ready and switched to indexedDB backend.');
                }
              );
            }
          );
        }
      }
    );
  };

  var getTermsInDB = function(callback) {
    if (!window.mozIndexedDB || window.location.protocol === 'file:') {
      callback();
      return;
    }
    var req = mozIndexedDB.open(dbName, dbVersion, 'JSZhuYing db');
    req.onerror = function() {
      debug('JSZhuYing: Problem while opening indexedDB.');
      callback();
    };
    req.onupgradeneeded = function(ev) {
      debug('JSZhuYing: IndexedDB upgradeneeded.');
      db = req.result;
      if (db.objectStoreNames.length !== 0) db.deleteObjectStore('terms');
      var store = db.createObjectStore(
        'terms',
        {
          keyPath: 'syllables'
        }
      );
    };
    req.onsuccess = function() {
      debug('JSZhuYing: IndexedDB opened.');
      db = req.result;
      callback();
    };
  };

  var populateDBFromJSON = function(callback) {
    var chunks = [];
    var chunk = [];
    var i = 0;

    for (var syllables in jsonData) {
      chunk.push(syllables);
      i++;
      if (i > 256) {
        chunks.push(chunk);
        chunk = [];
        i = 0;
      }
    }
    chunks.push(chunk);
    chunks.push(['_last_entry_']);
    jsonData['_last_entry_'] = true;

    var loadChunk = function () {
      debug('JSZhuYing: Loading a chunk of data into IndexedDB, ' + (chunks.length -1) + ' chunks remaining.');
      var transaction = db.transaction('terms', IDBTransaction.READ_WRITE),
      store = transaction.objectStore('terms');

      transaction.onerror = function() {
        debug('JSZhuYing: Problem while populating DB with JSON data.');
      };
      transaction.oncomplete = function() {
        if (chunks.length) {
          setTimeout(loadChunk, 0);
        } else {
          jsonData = null;
          setTimeout(callback, 0);
        }

      };

      var syllables;
      var chunk = chunks.shift();
      for (i in chunk) {
        var syllables = chunk[i];
        store.add(
          {
            syllables: syllables,
            terms: jsonData[syllables]
          }
        );
      }
    };

    setTimeout(loadChunk, 0);

  };

  var getTermsJSON = function (callback) {

    // this is the database we need to get terms against.
    // the JSON is converted from tsi.src and phone.cin in Chewing source code.
    // https://github.com/chewing/libchewing/blob/master/data/tsi.src
    // https://github.com/chewing/libchewing/blob/master/data/phone.cin

    // XXX: tricky code path (for now)
    getWordsJSON(
      function () {
        getPhrasesJSON(callback);
      }
    );
  };

  var getWordsJSON = function (callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', settings.wordsJSON || './words.json', true);
    xhr.responseType = 'json';
    xhr.overrideMimeType("application/json; charset=utf-8");
    xhr.onreadystatechange = function(ev) {
      if (xhr.readyState !== 4) return;
      if (typeof xhr.response !== 'object') {
        debug('JSZhuYing: Failed to load words.json.');
        return;
      }
      jsonData = {};
      for (var s in xhr.response) {
        jsonData[s] = xhr.response[s];
      }
      xhr = null;

      callback();
    };
    xhr.send(null);
  };

  var getPhrasesJSON = function (callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', settings.phrasesJSON || './phrases.json', true);
    xhr.responseType = 'json';
    xhr.overrideMimeType("application/json; charset=utf-8");
    xhr.onreadystatechange = function (ev) {
      if (xhr.readyState !== 4) return;
      if (typeof xhr.response !== 'object') {
        debug('JSZhuYing: Failed to load phrases.json.');
        return;
      }
      for (var s in xhr.response) {
        jsonData[s] = xhr.response[s];
      }
      xhr = null;

      callback();
    };
    xhr.send(null);
  };

  /*
  * Math function that return all possible compositions of a given natural number
  * callback will be called 2^(n-1) times.
  *
  * ref: http://en.wikipedia.org/wiki/Composition_(number_theory)#Examples
  * also: http://stackoverflow.com/questions/8375439
  */
  var compositionsOf = function(n, callback) {
    var x, a, j;
    x = 1 << n - 1;
    while (x--) {
      a = [1];
      j = 0;
      while (n - 1 > j) {
        if (x & (1 << j)) {
          a[a.length - 1]++;
        } else {
          a.push(1);
        }
        j++;
      }
      callback.call(this, a);
    }
  };

  /*
  * With series of syllables, return an array of possible sentences
  *
  */
  var getSentences = function(syllables, callback) {
    var sentences = [], n = 0;
    compositionsOf.call(
      this,
      syllables.length,
      /* This callback will be called 2^(n-1) times */
      function(composition) {
        var str = [], start = 0, i = 0,
        next = function() {
          var numOfWord = composition[i];
          if (composition.length === i) return finish();
          i++;
          getTermWithHighestScore(
            syllables.slice(start, start + numOfWord),
            function(term) {
              if (!term) return finish();
              str.push(term);
              start += numOfWord;
              next();
            }
          );
        },
        finish = function() {
          if (start === syllables.length) sentences.push(str); // complete; this composition does made up a sentence
          n++;
          if (n === (1 << (syllables.length - 1))) {
            cleanCache();

            sentences = sentences.sort(
              function (a, b) {
                var scoreA = 0;

                a.forEach(
                  function(term) {
                    scoreA += term[1];
                  }
                );

                var scoreB = 0;
                b.forEach(
                  function(term) {
                    scoreB += term[1];
                  }
                );

                return (scoreB - scoreA);
              }
            );

            callback(sentences);
          }
        };
        next();
      }
    );
  };

  /*
  * Simple query function that return an array of objects representing all possible terms
  *
  */
  var getTerms = function(syllables, callback) {
    if (!jsonData && !db) {
      debug('JSZhuYing: database not ready.');
      return callback(false);
    }

    var syllablesStr = syllables.join('-').replace(/ /g , '');

    if (jsonData)
      return callback(jsonData[syllablesStr] || false);
    if (typeof cache[syllablesStr] !== 'undefined')
      return callback(cache[syllablesStr]);
    var req = db.transaction('terms'/*, IDBTransaction.READ_ONLY */).objectStore('terms').get(syllablesStr);
    req.onerror = function() {
      debug('JSZhuYing: database read error.');
      return callback(false);
    };
    return req.onsuccess = function(ev) {
      cleanCache();
      if (ev.target.result) {
        cache[syllablesStr] = ev.target.result.terms;
        return callback(ev.target.result.terms);
      } else {
        cache[syllablesStr] = false;
        return callback(false);
      }
    };
  };

  /*
  * Return the term with the highest score
  *
  */
  var getTermWithHighestScore = function(syllables, callback) {
    return getTerms(
      syllables,
      function(terms) {
        if (!terms) return callback(false);
        return callback(terms[0]);
      }
    );
  };

  var cleanCache = function() {
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(
      function() {
        cache = {};
      },
      4000
    );
  };

  init.call(this);

  return {
    version: version,
    getSentences: getSentences,
    getTerms: getTerms,
    getTermWithHighestScore: getTermWithHighestScore
  };
};

/*
*  Mobile-style interaction front-end for JSZhuying
*/

'use strict';

if (!JSZhuYing) {
  debug('JSZhuYing: front-end script should load *after* the main script.');
  var JSZhuYing = {};
}

JSZhuYing.Mobi = function(settings) {
  var symbolType = {
    'ㄅ': 'consonant',
    'ㄆ': 'consonant',
    'ㄇ': 'consonant',
    'ㄈ': 'consonant',
    'ㄉ': 'consonant',
    'ㄊ': 'consonant',
    'ㄋ': 'consonant',
    'ㄌ': 'consonant',
    'ㄍ': 'consonant',
    'ㄎ': 'consonant',
    'ㄏ': 'consonant',
    'ㄐ': 'consonant',
    'ㄑ': 'consonant',
    'ㄒ': 'consonant',
    'ㄓ': 'consonant',
    'ㄔ': 'consonant',
    'ㄕ': 'consonant',
    'ㄖ': 'consonant',
    'ㄗ': 'consonant',
    'ㄘ': 'consonant',
    'ㄙ': 'consonant',
    'ㄧ': 'vowel1',
    'ㄨ': 'vowel1',
    'ㄩ': 'vowel1',
    'ㄚ': 'vowel2',
    'ㄛ': 'vowel2',
    'ㄜ': 'vowel2',
    'ㄝ': 'vowel2',
    'ㄞ': 'vowel2',
    'ㄟ': 'vowel2',
    'ㄠ': 'vowel2',
    'ㄡ': 'vowel2',
    'ㄢ': 'vowel2',
    'ㄣ': 'vowel2',
    'ㄤ': 'vowel2',
    'ㄥ': 'vowel2',
    'ㄦ': 'vowel2',
    ' ': 'tone',
    '˙': 'tone',
    'ˊ': 'tone',
    'ˇ': 'tone',
    'ˋ': 'tone'
  };

  var symbolPlace = {
    'consonant': 0,
    'vowel1': 1,
    'vowel2': 2,
    'tone': 3
  };

  var getChoices = function(syllables, type, callback) {
    var choices = [];
    switch (type) {
      case 'sentence':
        jszhuying.getSentences(
          syllables,
          function(sentences) {
            if (!sentences) return callback([]);
            sentences.forEach(
              function(sentence) {
                var str = '';
                sentence.forEach(
                  function(term) {
                    str += term[0];
                  }
                );
                if (choices.indexOf(str) === -1) choices.push(str);
              }
            );
            callback(choices);
          }
        );
      break;
      case 'term':
        jszhuying.getTerms(
          syllables,
          function(terms) {
            if (!terms) return callback([]);
            terms.forEach(
              function(term) {
                choices.push(term[0]);
              }
            );
            callback(choices);
          }
        );
      break;
    }
  };

  var empty = function() {
    syllablesInBuffer = [''];
    pendingSyllable = ['', '', '', ''];
    firstChoice = '';
    if (!jszhuying) {
      jszhuying = JSZhuYing(jszhuyingSettings);
      return;
    }
  };

  var queue = function(code) {
    keypressQueue.push(code);
    if (!isWorking) {
      isWorking = true;
      next();
    }
  };

  var select = function(text) {
    settings.sendString(text);
    var i = text.length;
    while (i--) {
      syllablesInBuffer.shift();
    }
    if (!syllablesInBuffer.length) {
      syllablesInBuffer = [''];
      pendingSyllable = ['', '', '', ''];
    }
    findChoices(function() {});
  };

  var next = function() {
    if (!jszhuying) {
      jszhuyingSettings.ready = next;
      jszhuying = JSZhuYing(jszhuyingSettings);
      return;
    }
    if (!keypressQueue.length) {
      isWorking = false;
      return;
    }
    keypressed(
      keypressQueue.shift(),
      next
    );
  };

  var findChoices = function(callback) {
    var allChoices = [], syllablesForQuery = [].concat(syllablesInBuffer);
    if (pendingSyllable[3] === '' && syllablesForQuery[syllablesForQuery.length - 1]) {
      syllablesForQuery[syllablesForQuery.length - 1] = pendingSyllable.join('') + ' ';
    }
    if (!syllablesInBuffer.join('').length) {
      settings.sendChoices(allChoices);
      firstChoice = '';
      return callback();
    }
    getChoices(
      syllablesForQuery,
      'term',
      function(choices) {
        choices.forEach(
          function(choice) {
            allChoices.push([choice, 'whole']);
          }
        );
        if (syllablesInBuffer.length === 1 && allChoices.length) {
          settings.sendChoices(allChoices);
          firstChoice = allChoices[0][0];
          return callback();
        } else if (syllablesInBuffer.length === 1) {
          allChoices.push([syllablesInBuffer.join(''), 'whole']);
          settings.sendChoices(allChoices);
          firstChoice = allChoices[0][0];
          return callback();
        }
        getChoices(
          syllablesForQuery,
          'sentence',
          function(choices) {
            choices.forEach(
              function(choice) {
                if (!allChoices.some(
                  function(availChoice) {
                    return (availChoice[0] === choice);
                  }
                )) {
                  allChoices.push([choice, 'whole']);
                }
              }
            );

            if (!allChoices.length) allChoices.push([syllablesInBuffer.join(''), 'whole']);
            firstChoice = allChoices[0][0];

            var i = Math.min(8, syllablesInBuffer.length - 1),
            findTerms = function() {
              getChoices(
                syllablesForQuery.slice(0, i),
                'term',
                function(choices) {
                  choices.forEach(
                    function(choice) {
                      allChoices.push([choice, 'term']);
                    }
                  );
                  i--;
                  if (i) findTerms();
                  else {
                    settings.sendChoices(allChoices);
                    return callback();
                  }
                }
              );
            };
            findTerms();
          }
        );
      }
    );
  };

  var keypressed = function(code, callback) {
    if (code === 13) { // enter
      if (firstChoice) {
        settings.sendString(firstChoice);
        settings.sendChoices([]);
        empty();
      } else {
        settings.sendKey(13); // default action
      }
      return callback();
    }

    if (code === 8) { // backspace
      if (
        syllablesInBuffer.length === 1
        && syllablesInBuffer[0] === ''
      ) {
        settings.sendKey(8); // default action
        return callback();
      }
      if (
        !pendingSyllable.some(function(s) { return !!s; })
      ) {
        syllablesInBuffer = syllablesInBuffer.slice(0, syllablesInBuffer.length - 1);
        syllablesInBuffer[syllablesInBuffer.length - 1] = pendingSyllable.join('');
        return findChoices(callback);
      }
      pendingSyllable = ['', '', '', ''];
      syllablesInBuffer[syllablesInBuffer.length - 1] = pendingSyllable.join('');
      return findChoices(callback);
    }

    var symbol = String.fromCharCode(code);
    if (!symbolType[symbol]) {
      if (firstChoice) {
        settings.sendString(firstChoice);
        settings.sendChoices([]);
        empty();
      }
      settings.sendKey(code);
      return callback();
    }

    pendingSyllable[symbolPlace[symbolType[symbol]]] = symbol;

    syllablesInBuffer[syllablesInBuffer.length - 1] = pendingSyllable.join('');

    if (
      symbolType[symbol] === 'tone'
      && syllablesInBuffer.length >= (settings.bufferLimit || 10)
    ) {
      var i = syllablesInBuffer.length - 1,
      findTerms = function() {
        getChoices(
          syllablesInBuffer.slice(0, i),
          'term',
          function(choices) {
            if (choices[0] || i === 1) {
              settings.sendString(
                choices[0] || syllablesInBuffer.slice(0, i).join('')
              );
              while (i--) {
                syllablesInBuffer.shift();
              }
              if (!syllablesInBuffer.length) {
                syllablesInBuffer = [''];
                pendingSyllable = ['', '', '', ''];
              }
              return findChoices(
                function() {
                  if (symbolType[symbol] === 'tone') {
                    // start syllables for next character
                    syllablesInBuffer.push('');
                    pendingSyllable = ['', '', '', ''];
                  }
                  return callback();
                }
              );
            }
            i--;
            return findTerms();
          }
        );
      };
      return findTerms();
    }

    findChoices(
      function() {
        if (symbolType[symbol] === 'tone') {
          // start syllables for next character
          syllablesInBuffer.push('');
          pendingSyllable = ['', '', '', ''];
        }
        callback();
      }
    );
  };

  var syllablesInBuffer = [''];
  var pendingSyllable = ['', '', '', ''];
  var firstChoice = '';
  var keypressQueue = [];
  var isWorking = false;
  var jszhuyingSettings = {
    wordsJSON: settings.path + '/words.json',
    phrasesJSON: settings.path + '/phrases.json'
  };
  var jszhuying;

  if (!settings)
    settings = {};

  ['sendString', 'sendChoices', 'sendKey'].forEach(
    function(functionName) {
      if (!settings[functionName])
        settings[functionName] = function() {};
    }
  );

  return {
    keypress: queue,
    select: select,
    empty: empty
  };
};

