/*
 * se-player.js
 * 効果音(SE)プレイヤー（ミニ将棋・コネクトフォー など、複数のゲームで共有）。
 *
 * 音声ファイルを使わず、Web Audio API のオシレーター/ノイズ合成だけで
 * 「木の駒がコツンと当たる音」「王手のアラート」「勝敗のファンファーレ」等を
 * その場で生成する。音源ファイルが不要なので assets/ フォルダを増やさずに
 * 済み、bgm-player.js とも独立して動作する。
 *
 * 使い方:
 *   window.sePlayer.play('move');     // 駒を動かす
 *   window.sePlayer.play('capture');  // 相手の駒を取る
 *   window.sePlayer.play('drop');     // 持ち駒を打つ / コインを落とす
 *   window.sePlayer.play('check');    // 王手
 *   window.sePlayer.play('promote');  // 成る
 *   window.sePlayer.play('win');      // 勝ち
 *   window.sePlayer.play('lose');     // 負け
 *   window.sePlayer.play('draw');     // 引き分け
 *   window.sePlayer.play('click');    // ボタン/UI操作
 *   window.sePlayer.play('timeout');  // 鬼モードの持ち時間切れ
 *   window.sePlayer.play('deny');     // 待った却下など、軽いネガティブ操作
 *
 *   window.sePlayer.setMuted(true/false);
 *   window.sePlayer.isMuted();
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'pref_se_muted';
  var ctx = null;
  var muted = false;

  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) { /* localStorage が使えない環境では無視 */ }

  function getContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  // ブラウザの自動再生ポリシー対策: 最初のユーザー操作で AudioContext を起こす
  function unlock() {
    var c = getContext();
    if (c && c.state === 'suspended') {
      c.resume().catch(function () {});
    }
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (evt) {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });

  // --- 基本パーツ ---------------------------------------------------------

  // 単純なトーン(サイン/三角/矩形波)を、指定した音量エンベロープで鳴らす
  function tone(c, opts) {
    var startAt = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, startAt);
    if (opts.freqEnd != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 1), startAt + (opts.freqTime || opts.duration));
    }
    var peak = opts.volume != null ? opts.volume : 0.2;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + (opts.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + (opts.attack || 0.005) + (opts.decay || opts.duration || 0.2));
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startAt);
    osc.stop(startAt + (opts.attack || 0.005) + (opts.decay || opts.duration || 0.2) + 0.05);
  }

  // ノイズバースト(木片やパチンという打撃音のアタック成分に使う)
  function noiseBurst(c, opts) {
    var startAt = c.currentTime + (opts.delay || 0);
    var duration = opts.duration || 0.08;
    var bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
    var buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      // 減衰する白色ノイズ
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, opts.falloff || 2);
    }
    var src = c.createBufferSource();
    src.buffer = buffer;

    var filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.setValueAtTime(opts.filterFreq || 1200, startAt);
    if (opts.filterQ != null) filter.Q.setValueAtTime(opts.filterQ, startAt);

    var gain = c.createGain();
    var peak = opts.volume != null ? opts.volume : 0.5;
    gain.gain.setValueAtTime(peak, startAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(startAt);
    src.stop(startAt + duration + 0.02);
  }

  // --- 個々の効果音 --------------------------------------------------------
  // 将棋の駒(木の五角形)が盤に当たる感触を、短いノイズの「アタック」+
  // 低めの木質トーンの「ボディ」の2層で表現する。取る時はアタックを鋭く・
  // 高めにし、動かす時より少しだけ長い余韻を足して差をつけている。

  function playMove(c) {
    noiseBurst(c, { filterFreq: 1800, filterQ: 1.2, duration: 0.05, volume: 0.35, falloff: 3 });
    tone(c, { type: 'triangle', freq: 240, freqEnd: 150, duration: 0.09, attack: 0.002, volume: 0.22 });
  }

  function playCapture(c) {
    noiseBurst(c, { filterFreq: 2600, filterQ: 1.0, duration: 0.06, volume: 0.5, falloff: 2.4 });
    tone(c, { type: 'triangle', freq: 320, freqEnd: 160, duration: 0.14, attack: 0.002, volume: 0.28 });
    tone(c, { type: 'sine', freq: 900, freqEnd: 500, duration: 0.05, delay: 0.015, volume: 0.08 });
  }

  function playDrop(c) {
    // 駒台からつまんで打つ、少しやわらかい「コトッ」という音
    // （コネクトフォーではコインが盤に着地する音としても流用）
    noiseBurst(c, { filterFreq: 1400, filterQ: 1.4, duration: 0.06, volume: 0.3, falloff: 2.6 });
    tone(c, { type: 'sine', freq: 200, freqEnd: 130, duration: 0.11, attack: 0.004, volume: 0.2 });
  }

  function playCheck(c) {
    // 緊張感のある短い二音のアラート(不協和な下降)
    tone(c, { type: 'square', freq: 660, freqEnd: 660, duration: 0.09, attack: 0.003, volume: 0.14 });
    tone(c, { type: 'square', freq: 520, freqEnd: 520, duration: 0.16, delay: 0.1, attack: 0.003, volume: 0.16 });
  }

  function playPromote(c) {
    // 駒が金色に輝くような、上昇する短いアルペジオ
    var notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach(function (f, i) {
      tone(c, { type: 'sine', freq: f, duration: 0.16, delay: i * 0.055, attack: 0.004, volume: 0.14 });
      tone(c, { type: 'triangle', freq: f * 2, duration: 0.1, delay: i * 0.055, attack: 0.004, volume: 0.05 });
    });
  }

  function playWin(c) {
    // 明るい短いファンファーレ
    var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    var delays = [0, 0.11, 0.22, 0.33, 0.36];
    notes.forEach(function (f, i) {
      tone(c, { type: 'triangle', freq: f, duration: 0.4, delay: delays[i], attack: 0.005, volume: i === notes.length - 1 ? 0.22 : 0.16 });
    });
  }

  function playLose(c) {
    // 落ち着いた下降トーン
    var notes = [493.88, 440, 392, 293.66];
    notes.forEach(function (f, i) {
      tone(c, { type: 'sine', freq: f, duration: 0.28, delay: i * 0.14, attack: 0.006, volume: 0.15 });
    });
  }

  function playDraw(c) {
    // 勝ち負けのどちらでもない、フラットで落ち着いた二音
    tone(c, { type: 'sine', freq: 440, freqEnd: 330, duration: 0.22, attack: 0.006, volume: 0.15 });
    tone(c, { type: 'sine', freq: 330, freqEnd: 262, duration: 0.28, delay: 0.12, attack: 0.006, volume: 0.13 });
  }

  function playClick(c) {
    noiseBurst(c, { filterFreq: 3200, filterQ: 2.0, duration: 0.03, volume: 0.18, falloff: 4 });
  }

  function playDeny(c) {
    tone(c, { type: 'sine', freq: 300, freqEnd: 180, duration: 0.14, attack: 0.004, volume: 0.14 });
  }

  function playTimeout(c) {
    // 鬼モードの持ち時間切れ: 短いブザー3連打
    for (var i = 0; i < 3; i++) {
      tone(c, { type: 'sawtooth', freq: 220, duration: 0.12, delay: i * 0.16, attack: 0.004, volume: 0.16 });
    }
  }

  var PLAYERS = {
    move: playMove,
    capture: playCapture,
    drop: playDrop,
    check: playCheck,
    promote: playPromote,
    win: playWin,
    lose: playLose,
    draw: playDraw,
    click: playClick,
    deny: playDeny,
    timeout: playTimeout,
  };

  function play(name) {
    if (muted) return;
    var c = getContext();
    if (!c) return;
    if (c.state === 'suspended') { c.resume().catch(function () {}); }
    var fn = PLAYERS[name];
    if (!fn) return;
    try { fn(c); } catch (e) { /* 効果音の失敗はゲーム進行に影響させない */ }
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) {}
  }

  function isMuted() { return muted; }

  window.sePlayer = { play: play, setMuted: setMuted, isMuted: isMuted };
})();
