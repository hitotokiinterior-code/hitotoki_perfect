/*
 * hitotoki 課金(RevenueCat)- 「広告を消す」買い切り購入
 * -----------------------------------------------
 * RevenueCatを使う理由：
 * Appleのレシート検証やサブスク/買い切りの状態管理を自分のサーバーなしで
 * RevenueCatに任せられる。ダッシュボードで商品・権利(Entitlement)を
 * 紐付けるだけでよい(個人開発・Codemagicビルドと相性が良い)。
 *
 * 事前準備(あなたの作業。コードでは代行できません。
 * Apple Developer Programの承認が下りてから着手してください):
 *   1. App Store Connect →「アプリ内課金」→ 非消耗型(Non-Consumable)で
 *      「広告を消す」商品を作成する。
 *        → Product ID は下の PRODUCT_ID と必ず一致させる（例: remove_ads）
 *        → 価格・表示名などを入力し、税務/銀行情報の設定も済ませておく
 *   2. https://app.revenuecat.com で無料アカウント作成 → 新規プロジェクト作成
 *      → 「Apps」でiOSアプリを追加（Bundle IDをXcodeプロジェクトと一致させる）
 *   3. 「Products」で手順1のProduct IDをインポート
 *   4. 「Entitlements」で下の ENTITLEMENT_ID という名前の権利を新規作成し、
 *      手順3の商品を紐付ける
 *   5. 「Offerings」→ デフォルトのOfferingに、手順3の商品を含む
 *      Package（Lifetime推奨）を追加する
 *   6. プロジェクト設定 → 「API Keys」→ 「Public app-specific API keys」の
 *      iOS用キー(appl_で始まる文字列)をコピーし、下の
 *      REVENUECAT_API_KEY_IOS に貼り付ける
 *
 * ▼開発中の動作確認について
 * 上記1〜6がまだ（Apple Developer Program承認待ちなど）でも、
 * ブラウザのコンソールから下記を打てば「購入済み」状態を疑似的に
 * 切り替えて、広告ON/OFF時のレイアウト変化だけ先にテストできます。
 *   hitotokiPurchases._setDebugOverride(true)   // 広告を消した状態にする
 *   hitotokiPurchases._setDebugOverride(false)  // 広告ありの状態にする
 *   hitotokiPurchases._setDebugOverride(null)   // デバッグ上書きを解除（実際の購入状態に戻す）
 * この上書きはlocalStorageに保存されるので、実機・シミュレーター・
 * Web版いずれでも同じように効きます。RevenueCatの実連携が動くように
 * なった後にデバッグ上書きが残っていると誤解の元になるので、
 * リリース前に null に戻すのを忘れないでください。
 */
(function () {
  // ⚠️ RevenueCatダッシュボードで発行された「Public API Key(iOS)」に置き換えてください
  var REVENUECAT_API_KEY_IOS = 'REVENUECAT_API_KEY_HERE';

  // App Store Connect / RevenueCat 側で決めた識別子（両方のダッシュボードで一致させる）
  var PRODUCT_ID = 'remove_ads';
  var ENTITLEMENT_ID = 'no_ads';

  var DEBUG_KEY = 'hitotoki_debug_ads_removed'; // localStorage: 'true' / 'false' / (未設定)

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  var listeners = [];
  var cachedAdsRemoved = false;

  function getDebugOverride() {
    try {
      var v = window.localStorage.getItem(DEBUG_KEY);
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch (e) { /* localStorage不可の環境は無視 */ }
    return null; // 未設定＝実際の購入状態を使う
  }

  function setState(adsRemoved) {
    adsRemoved = !!adsRemoved;
    if (cachedAdsRemoved === adsRemoved) return;
    cachedAdsRemoved = adsRemoved;
    listeners.forEach(function (fn) {
      try { fn(cachedAdsRemoved); } catch (e) { console.warn('[purchases] onChange handler failed', e); }
    });
  }

  // RevenueCatから返ってきたcustomerInfoを見て、広告非表示の権利が
  // 有効かどうかを判定する。デバッグ上書きがある場合はそちらを優先する。
  function applyCustomerInfo(customerInfo) {
    var debugOverride = getDebugOverride();
    if (debugOverride !== null) {
      setState(debugOverride);
      return;
    }
    var active = customerInfo && customerInfo.entitlements && customerInfo.entitlements.active;
    setState(!!(active && active[ENTITLEMENT_ID]));
  }

  var readyResolve;
  var readyPromise = new Promise(function (resolve) { readyResolve = resolve; });
  var readyDone = false;
  function markReady() {
    if (readyDone) return;
    readyDone = true;
    readyResolve(cachedAdsRemoved);
  }

  async function init() {
    var debugOverride = getDebugOverride();

    if (!isNative() || !window.Purchases) {
      // Web版(Vercel)、またはプラグイン未ロード時はデバッグ上書きのみ有効。
      // 通常時（上書きなし）はWeb版では常に広告ありとして扱う。
      if (debugOverride !== null) setState(debugOverride);
      markReady();
      return;
    }
    if (window.hitotokiPurchasesInitialized) { markReady(); return; }
    window.hitotokiPurchasesInitialized = true;

    try {
      await window.Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });

      window.Purchases.addCustomerInfoUpdateListener(function (result) {
        applyCustomerInfo(result && result.customerInfo);
      });

      var result = await window.Purchases.getCustomerInfo();
      applyCustomerInfo(result && result.customerInfo);
    } catch (e) {
      console.warn('[purchases] RevenueCat init failed', e);
      if (debugOverride !== null) setState(debugOverride);
    }
    markReady();
  }

  // 「広告を消す」ボタンから呼ぶ購入処理
  async function buyRemoveAds() {
    if (!isNative() || !window.Purchases) {
      throw new Error('購入はアプリ版（実機/シミュレーター）でのみ行えます');
    }
    var offerings = await window.Purchases.getOfferings();
    var current = offerings && offerings.current;
    var pkg = current && current.availablePackages && current.availablePackages.find(function (p) {
      return p.storeProduct && p.storeProduct.identifier === PRODUCT_ID;
    });
    if (!pkg) pkg = current && current.availablePackages && current.availablePackages[0];
    if (!pkg) throw new Error('購入可能な商品が見つかりません（RevenueCatのOfferings設定を確認してください）');

    var result = await window.Purchases.purchasePackage({ aPackage: pkg });
    applyCustomerInfo(result && result.customerInfo);
    return cachedAdsRemoved;
  }

  // 「購入を復元」ボタンから呼ぶ（機種変更・再インストール時に必須）
  async function restore() {
    if (!isNative() || !window.Purchases) return cachedAdsRemoved;
    var result = await window.Purchases.restorePurchases();
    applyCustomerInfo(result && result.customerInfo);
    return cachedAdsRemoved;
  }

  window.hitotokiPurchases = {
    // 起動時の購入状態チェックが終わるまで待ちたい時に使う: await hitotokiPurchases.ready
    ready: readyPromise,
    // 現時点でのキャッシュ済み状態を同期的に返す（ready解決前はfalseを返す）
    isAdsRemoved: function () { return cachedAdsRemoved; },
    buyRemoveAds: buyRemoveAds,
    restore: restore,
    // 購入状態が変わるたびに呼ばれるコールバックを登録（UIの出し分け用）
    onChange: function (fn) { listeners.push(fn); },
    // 開発用: true/false/nullを渡してテスト（詳細はファイル冒頭のコメント参照）
    _setDebugOverride: function (value) {
      try {
        if (value === null) window.localStorage.removeItem(DEBUG_KEY);
        else window.localStorage.setItem(DEBUG_KEY, value ? 'true' : 'false');
      } catch (e) { /* ignore */ }
      if (value !== null) setState(value);
      else if (isNative() && window.Purchases) {
        window.Purchases.getCustomerInfo().then(function (result) {
          applyCustomerInfo(result && result.customerInfo);
        }).catch(function () {});
      } else {
        setState(false);
      }
    },
  };

  init();
})();
