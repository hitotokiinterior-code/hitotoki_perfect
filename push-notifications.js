/*
 * hitotoki プッシュ通知(OneSignal)
 * -----------------------------------------------
 * OneSignalを使う理由：
 * 自前でサーバーを立てなくても、OneSignalの管理画面(ダッシュボード)から
 * 「お知らせ」を配信できる。Apple側には、OneSignal経由でAPNsキー(.p8)を登録する。
 *
 * このファイルの役割：
 *   1. OneSignalを初期化する（起動時に、通知の許可ダイアログは出さない）
 *   2. 通知の許可を取る / オン・オフを切り替える関数を、window.hitotokiPush として公開する
 *      （index.html の「⚙ → 通知設定」と、ゲームから戻ったときの事前確認から使う）
 *
 * 許可ダイアログのタイミング：
 *   iPhoneは、システムの許可ダイアログを一度しか出せない（拒否されると、設定アプリでしか直せない）。
 *   そのため、アプリ独自の説明画面で「受け取る」を押してもらってから、システムの許可を求める。
 *
 * 通知の中身（新しいゲームの追加などのお知らせ）は、
 * コードでは送らず、OneSignalダッシュボードの「Messages > New Push」から、
 * 送りたいときに手動で配信する。
 * 事前確認の画面では「新しいゲームの追加などの際に、お知らせします」と伝えているので、
 * それ以外（遊んでいない人への催促など）の通知は送らない。
 *
 * Web(Vercel)版ではネイティブのpush機能が無いため、Capacitor.isNativePlatform()が
 * trueの時だけ動く。Web版では window.hitotokiPush.supported が false になる。
 */
(function () {
  // OneSignalダッシュボードで発行された「OneSignal App ID」
  var ONESIGNAL_APP_ID = '0824694a-98c6-449f-9e4c-45cd23aa5f7b';

  var PREF_KEY = 'pref_notifications';       // 'on' | 'off' （⚙の通知設定の状態）
  var ASK_COUNT_KEY = 'push_ask_count';      // 事前確認を出した回数
  var ASK_LAST_KEY = 'push_ask_last';        // 最後に事前確認を出した時刻(ミリ秒)
  var MAX_ASK_COUNT = 2;                     // 「あとで」にされても、聞くのは最大2回まで
  var ASK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 2回目は、3日以上あけてから

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // --- Web版・プラグインが無い場合：何もしない ---
  if (!isNative() || !window.OneSignal) {
    window.hitotokiPush = { supported: false };
    return;
  }
  var OS = window.OneSignal;

  // 複数ページで多重初期化しないためのガード
  if (!window.hitotokiPushInitialized) {
    window.hitotokiPushInitialized = true;
    try {
      OS.initialize(ONESIGNAL_APP_ID);
    } catch (e) {
      console.warn('[push] OneSignal init failed', e);
    }
  }

  // 今、通知が有効か（端末の許可がある ＋ アプリ内でオフにしていない）
  async function getEnabled() {
    try {
      var has = await OS.Notifications.hasPermission();
      if (!has) return false;
      if (lsGet(PREF_KEY) === 'off') return false;
      return !!(await OS.User.pushSubscription.getOptedInAsync());
    } catch (e) {
      return false;
    }
  }

  // 通知をオンにする。戻り値: 'on' | 'denied'(端末の設定で拒否されている) | 'error'
  async function enable() {
    try {
      var has = await OS.Notifications.hasPermission();
      if (!has) {
        // 一度も聞いていなければシステムのダイアログ。すでに拒否済みなら、設定アプリへの案内を出す
        var canAsk = await OS.Notifications.canRequestPermission();
        var accepted = await OS.Notifications.requestPermission(!canAsk);
        if (!accepted) return 'denied';
      }
      await OS.User.pushSubscription.optIn();
      lsSet(PREF_KEY, 'on');
      return 'on';
    } catch (e) {
      console.warn('[push] enable failed', e);
      return 'error';
    }
  }

  // 通知をオフにする（端末の許可はそのまま。このアプリへの配信だけを止める）
  async function disable() {
    try {
      await OS.User.pushSubscription.optOut();
      lsSet(PREF_KEY, 'off');
      return true;
    } catch (e) {
      console.warn('[push] disable failed', e);
      return false;
    }
  }

  // 事前確認(アプリ独自の説明画面)を出してよいか
  async function shouldAskFirst() {
    try {
      if (lsGet(PREF_KEY) === 'off') return false;
      var count = parseInt(lsGet(ASK_COUNT_KEY) || '0', 10) || 0;
      if (count >= MAX_ASK_COUNT) return false;
      var last = parseInt(lsGet(ASK_LAST_KEY) || '0', 10) || 0;
      if (last && Date.now() - last < ASK_INTERVAL_MS) return false;
      if (await OS.Notifications.hasPermission()) return false;   // すでに許可済み
      if (!(await OS.Notifications.canRequestPermission())) return false; // 拒否済み(聞き直せない)
      return true;
    } catch (e) {
      return false;
    }
  }

  // 事前確認を出したことを記録する（「あとで」の場合に、聞きすぎないため）
  function markAsked() {
    var count = parseInt(lsGet(ASK_COUNT_KEY) || '0', 10) || 0;
    lsSet(ASK_COUNT_KEY, String(count + 1));
    lsSet(ASK_LAST_KEY, String(Date.now()));
  }

  window.hitotokiPush = {
    supported: true,
    getEnabled: getEnabled,
    enable: enable,
    disable: disable,
    shouldAskFirst: shouldAskFirst,
    markAsked: markAsked
  };
})();
