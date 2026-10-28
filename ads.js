/*
 * hitotoki 広告(AdMob) - バナー + インタースティシャル(全画面)
 * -----------------------------------------------
 * 事前準備(あなたの作業。コードでは代行できません):
 *   1. https://admob.google.com で無料アカウント作成
 *   2. 「アプリを追加」→ iOSアプリとして登録
 *      → 発行される「AdMobアプリID」(ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy)を
 *        ios/App/App/Info.plist の GADApplicationIdentifier に設定(手順書参照)
 *   3. 「広告ユニット」→バナー広告ユニットを作成
 *      → 発行される「広告ユニットID」(ca-app-pub-xxxx/yyyy)を下の BANNER_AD_UNIT_ID に貼り付ける
 *   4. 同じく「広告ユニット」→今度は種類を「インタースティシャル」で新規作成
 *      → 発行される広告ユニットID(バナーとは別物)を下の INTERSTITIAL_AD_UNIT_ID に貼り付ける
 *
 * 審査中〜広告ユニットIDを本物に差し替えるまでは、Googleが用意している
 * テスト用ID(下記デフォルト値)のままにしておいてください。本番IDのまま
 * テストして自分の広告をクリックすると、AdMobアカウントが停止される
 * リスクがあるので要注意です。
 *
 * インタースティシャルの表示タイミング：
 * 対局が終わるたび(stats-tracker.jsのrecordGameEnd実行時)にカウントし、
 * GAMES_PER_INTERSTITIAL局に1回、結果画面が出ているタイミングで全画面広告を挟む。
 * カウントはlocalStorageに保存するので、途中でアプリを閉じたりゲームを
 * 切り替えたりしても「3局に1回」がリセットされずに続く。
 *
 * iOSのApp Tracking Transparency(ATT)について:
 * 「トラッキングの許可を求める」ダイアログをユーザーに出す必要があり、
 * 拒否された場合でも広告自体は「非パーソナライズ広告」として表示される
 * （収益は下がるが、表示自体は続けられる）。
 *
 * Web(Vercel)版ではネイティブの広告SDKが無いため、このスクリプトは
 * Capacitor.isNativePlatform()がtrueの時だけ動く。
 *
 * 「広告を消す」課金(purchases.js / RevenueCat)を購入済みのユーザーには
 * バナー・インタースティシャルとも一切表示しない。purchases.jsより後に
 * このファイルを読み込むこと。
 */
(function () {
  // ✅ 本番の広告ユニットID(新AdMobアカウント: pub-4044413836429156)
  //    アプリID: ca-app-pub-4044413836429156~5152450361 (codemagic.yaml の Info.plist 設定側で使用)
  var BANNER_AD_UNIT_ID_IOS = 'ca-app-pub-4044413836429156/8030070153';
  var INTERSTITIAL_AD_UNIT_ID_IOS = 'ca-app-pub-4044413836429156/5615484797';

  var GAMES_PER_INTERSTITIAL = 3; // 何局ごとにインタースティシャルを出すか
  var INTERSTITIAL_COUNT_KEY = 'hitotoki_games_since_interstitial';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---------- 診断モード ----------
  // TestFlightの実機ではSafariのWeb Inspectorが使えないため、広告が出ない原因を調べる間だけ、
  // 「どこまで進んで、どこで止まったか」を画面に緑の文字で表示し続ける（タップで閉じる）。
  // ★ 広告が出ない原因は特定済み(同意確認のエラーで処理が止まっていた)。通常は false。
  //    また調べたくなったら true にすると、画面に緑のログが出る。審査提出前は必ず false ★
  var ADS_DEBUG = false;
  // iOSアプリ内のWebView(UAに Safari/ が付かない)か。Web版(Vercel等)の通常ブラウザでは診断を出さない
  var inIosApp = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/Safari\//.test(navigator.userAgent);
  var debugLines = ['ads.js 診断版 v3'];
  var debugFlushed = false;

  function errText(e) {
    try {
      if (e && (e.message || e.errorMessage)) {
        return (e.code !== undefined ? 'code ' + e.code + ': ' : '') + (e.message || e.errorMessage);
      }
      return JSON.stringify(e);
    } catch (_) { return String(e); }
  }
  function debugActive() { return ADS_DEBUG && (isNative() || inIosApp); }
  function renderDebugOverlay() {
    if (!debugActive()) return;
    try {
      var el = document.getElementById('hitotokiAdsDebug');
      if (!el) {
        el = document.createElement('div');
        el.id = 'hitotokiAdsDebug';
        el.style.cssText = 'position:fixed;left:8px;right:8px;top:70px;z-index:2147483647;' +
          'background:rgba(0,0,0,0.88);color:#9f9;font:11px/1.45 monospace;padding:8px 10px;' +
          'border:1px solid #9f9;border-radius:8px;white-space:pre-wrap;max-height:55vh;overflow:auto;';
        el.addEventListener('click', function () { el.remove(); });
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = debugLines.join('\n') + '\n(タップで閉じる)';
    } catch (e) { /* ignore */ }
  }
  function dbg(line) {
    console.log('[ads] ' + line);
    if (ADS_DEBUG) { debugLines.push(line); renderDebugOverlay(); }
  }
  // 最初の結果（バナー成功／失敗／処理が途中で終了）が出た時に、1回だけダイアログでも知らせる
  function dbgFlush(title) {
    if (!debugActive() || debugFlushed) return;
    debugFlushed = true;
    try { alert('【広告診断 v3】' + title + '\n\n' + debugLines.join('\n')); } catch (e) { /* ignore */ }
  }

  dbg('Capacitor: ' + (window.Capacitor
    ? 'あり platform=' + (window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : '?') + ' native=' + isNative()
    : 'なし'));
  dbg('window.AdMob: ' + (window.AdMob ? 'あり' : 'なし'));
  dbg('purchases.js: ' + (window.hitotokiPurchases ? 'あり' : 'なし'));

  if (!isNative()) { dbg('→ ネイティブ判定がfalseのため、広告を出しません'); return; } // Web版では何もしない
  if (!window.AdMob) {
    // ネイティブアプリなのにAdMobが見つからない＝広告が出ない原因の候補
    dbg('→ window.AdMob が無いため終了（capacitor-bridge.js にAdMobが含まれていない可能性）');
    dbgFlush('AdMobが見つからない');
    return;
  }
  if (window.hitotokiAdsInitialized) { dbg('→ 初期化済みのため終了'); return; } // 複数ページで多重初期化しないためのガード
  window.hitotokiAdsInitialized = true;

  var AdMob = window.AdMob;
  var bannerShown = false;

  if (ADS_DEBUG) {
    // バナーの読み込みは showBanner が成功した後に非同期で行われるので、結果はイベントで受け取る
    AdMob.addListener('bannerAdLoaded', function () { dbg('バナー: 読み込み成功'); dbgFlush('バナー表示OK'); });
    AdMob.addListener('bannerAdFailedToLoad', function (err) { dbg('バナー: 読み込み失敗 ' + errText(err)); dbgFlush('バナー読み込み失敗'); });
    // 何のイベントも来なかった場合の保険（10秒後に途中経過を表示）
    setTimeout(function () { dbgFlush('10秒たっても結果なし'); }, 10000);
  }

  // ---------- ゲーム画面(モード選択・プレイ画面)用のレイアウト調整 ----------
  // ナビ(#bottomNav)が無いページ＝各ゲーム画面では、バナーは画面最下部(セーフエリアの上)に出る。
  // バナーに被らないよう、広告が出る間は body の高さをバナーの高さぶん縮める(html.ads-game)。
  // 広告を消す課金済みの端末では縮めない。課金状態は localStorage に控えて、起動直後から正しく判定する。
  var ADS_REMOVED_HINT_KEY = 'hitotoki_ads_removed_hint';
  // 広告用の余白(#adSlot)を自前で持っているゲーム(ドッツ&ボックス)は、二重に縮めないよう対象外にする
  var isGamePage = !document.getElementById('bottomNav') && !document.getElementById('adSlot');

  function readRemovedHint() {
    try { return window.localStorage.getItem(ADS_REMOVED_HINT_KEY) === '1'; } catch (e) { return false; }
  }
  function writeRemovedHint(removed) {
    try { window.localStorage.setItem(ADS_REMOVED_HINT_KEY, removed ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function setGameReserve(on) {
    if (!isGamePage) return;
    document.documentElement.classList.toggle('ads-game', !!on);
  }

  // 前回、実際に表示されたバナーの高さを覚えておき、ページを開いた直後から、その高さで枠を確保する。
  // （既定の60pxと実際の高さが違うと、バナーの読み込み後に、画面が数pxずれて見えるため）
  var ADS_H_KEY = 'hitotoki_ad_h';
  try {
    var savedAdH = parseInt(window.localStorage.getItem(ADS_H_KEY) || '', 10);
    if (savedAdH >= 30 && savedAdH <= 150) {
      document.documentElement.style.setProperty('--ad-h', savedAdH + 'px');
    }
  } catch (e) { /* ignore */ }

  if (isGamePage) {
    var st = document.createElement('style');
    st.textContent =
      'html.ads-game body{' +
      'box-sizing:border-box;' +
      'height:calc(100dvh - env(safe-area-inset-bottom, 0px) - var(--ad-h, 60px));' +
      'max-height:calc(100dvh - env(safe-area-inset-bottom, 0px) - var(--ad-h, 60px));' +
      'padding-bottom:8px !important;}';
    document.head.appendChild(st);
    // 課金済みでなければ、広告の読み込みを待たずに最初から枠を確保して、画面のガタつきを防ぐ
    setGameReserve(!readRemovedHint());
  }

  // 下部ナビ(#bottomNav)があるページ(=ホーム)では、バナーをナビの真上に浮かせる。
  // バナーはセーフエリア下端から margin 分だけ上に置かれるので、ナビ本体の高さ(--nav-h)を渡す。
  // ゲーム画面などナビが無いページは従来どおり margin 0(画面最下部)。
  function getBannerMargin() {
    if (!document.getElementById('bottomNav')) return 0;
    var navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h'));
    return Math.round(isNaN(navH) ? 60 : navH);
  }

  // 実際に表示されたバナーの高さをCSS変数 --ad-h に反映し、
  // 画面側の広告枠(.ad-banner-card)の高さとぴったり合わせる
  AdMob.addListener('bannerAdSizeChanged', function (info) {
    if (info && info.height > 0) {
      var realH = Math.ceil(info.height);
      document.documentElement.style.setProperty('--ad-h', realH + 'px');
      try { window.localStorage.setItem(ADS_H_KEY, String(realH)); } catch (e) { /* ignore */ }
      window.dispatchEvent(new Event('resize')); // 一覧の高さなどを再計算させる
    }
  });

  // 広告の読み込みに失敗したら、確保していた枠を元に戻す
  AdMob.addListener('bannerAdFailedToLoad', function () { setGameReserve(false); });

  async function showTheBanner() {
    if (bannerShown) return;
    try {
      await AdMob.showBanner({
        adId: BANNER_AD_UNIT_ID_IOS,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: getBannerMargin(),
        isTesting: true, // 本番切り替え時にこの行を削除する
      });
      bannerShown = true;
      setGameReserve(true);
      dbg('バナー: showBanner 呼び出しOK（読み込み結果を待っています）');
    } catch (e) {
      console.warn('[ads] AdMob showBanner failed', e);
      dbg('バナー: showBanner 失敗 ' + errText(e));
      dbgFlush('showBanner失敗');
      setGameReserve(false);
    }
  }

  async function hideTheBanner() {
    if (!bannerShown) return;
    try {
      await AdMob.hideBanner();
      bannerShown = false;
      setGameReserve(false);
    } catch (e) {
      console.warn('[ads] AdMob hideBanner failed', e);
    }
  }

  // ---------- インタースティシャル(3局に1回) ----------
  var interstitialReady = false;
  var interstitialShowing = false;

  function getGamesSinceInterstitial() {
    try {
      var n = parseInt(window.localStorage.getItem(INTERSTITIAL_COUNT_KEY), 10);
      return isNaN(n) ? 0 : n;
    } catch (e) {
      return 0;
    }
  }

  function setGamesSinceInterstitial(n) {
    try {
      window.localStorage.setItem(INTERSTITIAL_COUNT_KEY, String(n));
    } catch (e) { /* ignore */ }
  }

  async function prepareTheInterstitial() {
    if (interstitialShowing) return; // 表示中に読み込み直そうとしない
    try {
      await AdMob.prepareInterstitial({
        adId: INTERSTITIAL_AD_UNIT_ID_IOS,
        isTesting: true, // 本番切り替え時にこの行を削除する
      });
      interstitialReady = true;
      dbg('全画面広告: 準備OK');
    } catch (e) {
      console.warn('[ads] prepareInterstitial failed', e);
      dbg('全画面広告: 準備失敗 ' + errText(e));
      interstitialReady = false;
    }
  }

  // 対局終了イベント(stats-tracker.js)を購読し、3局に1回インタースティシャルを出す
  function setupInterstitialTrigger(purchases) {
    AdMob.addListener('interstitialAdDismissed', function () {
      interstitialShowing = false;
      interstitialReady = false;
      prepareTheInterstitial(); // 次回のためにすぐ読み込み直しておく
    });
    AdMob.addListener('interstitialAdFailedToShow', function () {
      interstitialShowing = false;
      interstitialReady = false;
      prepareTheInterstitial();
    });

    if (!(purchases && purchases.isAdsRemoved())) prepareTheInterstitial();

    window.addEventListener('hitotoki:gameEnd', function () {
      if (purchases && purchases.isAdsRemoved()) return; // 課金済みなら出さない

      var n = getGamesSinceInterstitial() + 1;
      if (n < GAMES_PER_INTERSTITIAL) {
        setGamesSinceInterstitial(n);
        return;
      }
      setGamesSinceInterstitial(0); // 出す/出せないに関わらずカウントはリセット

      if (interstitialReady && !interstitialShowing) {
        interstitialShowing = true;
        AdMob.showInterstitial().catch(function (e) {
          console.warn('[ads] showInterstitial failed', e);
          interstitialShowing = false;
          prepareTheInterstitial();
        });
      } else {
        // 読み込みが間に合っていなかった場合は今回は諦めて、次に備えて読み込み直す
        prepareTheInterstitial();
      }
    });
  }

  // 各段階は個別に try/catch する。トラッキング許可や同意確認(UMP)で例外が出ても、
  // それだけで広告全体を止めないため（日本などGDPR対象外の地域では同意確認は不要）。
  // ※ EEA等で同意が取れていない場合の配信可否は、AdMob SDK側が制御する。
  async function startAds() {
    // 1) 初期化（ここが失敗したら広告は出せない）
    try {
      await AdMob.initialize({
        // 開発中はtrueにしてGoogleのテスト広告だけを表示する。
        // 本番リリース時はfalseにする(Info.plistのGADApplicationIdentifierが必要)
        initializeForTesting: true,
      });
      dbg('1 初期化: OK');
    } catch (e) {
      console.warn('[ads] AdMob initialize failed', e);
      dbg('1 初期化: 失敗 ' + errText(e));
      setGameReserve(false);
      dbgFlush('初期化に失敗');
      return;
    }

    // 2) iOS 14以降のApp Tracking Transparency許可ダイアログ（失敗しても続行）
    try {
      var trackingInfo = await AdMob.trackingAuthorizationStatus();
      dbg('2 トラッキング許可: ' + trackingInfo.status);
      if (trackingInfo.status === 'notDetermined') {
        var after = await AdMob.requestTrackingAuthorization();
        dbg('2 トラッキング許可(ダイアログ後): ' + (after && after.status));
      }
    } catch (e) {
      dbg('2 トラッキング許可: エラー（続行） ' + errText(e));
    }

    // 3) 同意確認(UMP)（失敗しても続行。明確に「同意が取れていない」場合だけ広告を止める）
    try {
      var consentInfo = await AdMob.requestConsentInfo();
      dbg('3 同意確認: status=' + consentInfo.status + ' canRequestAds=' + consentInfo.canRequestAds);
      if (consentInfo.isConsentFormAvailable && consentInfo.status === 'REQUIRED') {
        consentInfo = await AdMob.showConsentForm();
        dbg('3 同意フォーム後: status=' + consentInfo.status + ' canRequestAds=' + consentInfo.canRequestAds);
      }
      if (consentInfo.canRequestAds === false) {
        dbg('3 同意が取れていないため広告を出しません');
        setGameReserve(false);
        dbgFlush('同意が取れていない');
        return;
      }
    } catch (e) {
      dbg('3 同意確認: エラー（続行） ' + errText(e));
    }

    // 4) 「広告を消す」課金(purchases.js)の状態を見て出し分ける。
    //    purchases.jsが読み込まれていない場合は、従来通り常に広告を出す。
    try {
      var purchases = window.hitotokiPurchases;
      if (!purchases) {
        dbg('4 課金モジュール: なし（広告を出します）');
        await showTheBanner();
        setupInterstitialTrigger(null);
        return;
      }

      // 課金の状態確認が終わるまで待つ。ただしRevenueCat側が応答しない場合に
      // 広告が永遠に出なくならないよう、最大5秒で見切りをつける。
      var readyResult = await Promise.race([
        purchases.ready.then(function () { return 'ready'; }),
        new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, 5000); }),
      ]);
      dbg('4 課金状態の確認: ' + readyResult + ' / 広告削除済み=' + purchases.isAdsRemoved());

      writeRemovedHint(purchases.isAdsRemoved());
      if (purchases.isAdsRemoved()) {
        setGameReserve(false);
        dbgFlush('広告削除が有効なので広告は出しません');
      }
      if (!purchases.isAdsRemoved()) await showTheBanner();
      setupInterstitialTrigger(purchases); // gameEndの監視は常に張っておき、出す判定は発火時に行う

      // 購入 / 復元によって状態が後から変わった場合にも追従する
      purchases.onChange(function (adsRemoved) {
        writeRemovedHint(adsRemoved);
        if (adsRemoved) hideTheBanner();
        else { showTheBanner(); prepareTheInterstitial(); }
      });
    } catch (e) {
      console.warn('[ads] AdMob start failed', e);
      dbg('4 広告の開始処理: 失敗 ' + errText(e));
      setGameReserve(false);
      dbgFlush('広告の開始処理に失敗');
    }
  }

  startAds();
})();
