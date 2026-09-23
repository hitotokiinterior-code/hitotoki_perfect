/*
 * hitotoki バナー広告(AdMob)
 * -----------------------------------------------
 * 事前準備(あなたの作業。コードでは代行できません):
 *   1. https://admob.google.com で無料アカウント作成
 *   2. 「アプリを追加」→ iOSアプリとして登録
 *      → 発行される「AdMobアプリID」(ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy)を
 *        ios/App/App/Info.plist の GADApplicationIdentifier に設定(手順書参照)
 *   3. 「広告ユニット」→バナー広告ユニットを作成
 *      → 発行される「広告ユニットID」(ca-app-pub-xxxx/yyyy)を下の BANNER_AD_UNIT_ID に貼り付ける
 *
 * 審査中〜広告ユニットIDを本物に差し替えるまでは、Googleが用意している
 * テスト用ID(下記デフォルト値)のままにしておいてください。本番IDのまま
 * テストして自分の広告をクリックすると、AdMobアカウントが停止される
 * リスクがあるので要注意です。
 *
 * iOSのApp Tracking Transparency(ATT)について:
 * 「トラッキングの許可を求める」ダイアログをユーザーに出す必要があり、
 * 拒否された場合でも広告自体は「非パーソナライズ広告」として表示される
 * （収益は下がるが、表示自体は続けられる）。
 *
 * Web(Vercel)版ではネイティブの広告SDKが無いため、このスクリプトは
 * Capacitor.isNativePlatform()がtrueの時だけ動く。
 */
(function () {
  // ✅ 本番の広告ユニットID(バナー)に差し替え済み
  var BANNER_AD_UNIT_ID_IOS = 'ca-app-pub-9422550075542216/2933363590';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  if (!isNative()) return; // Web版では何もしない
  if (!window.AdMob) return;
  if (window.hitotokiAdsInitialized) return; // 複数ページで多重初期化しないためのガード
  window.hitotokiAdsInitialized = true;

  var AdMob = window.AdMob;

  async function startAds() {
    try {
      await AdMob.initialize({
        // 開発中はtrueにしてGoogleのテスト広告だけを表示する。
        // 本番リリース時はfalseにする(Info.plistのGADApplicationIdentifierが必要)
        initializeForTesting: true,
      });

      // iOS 14以降のApp Tracking Transparency許可ダイアログ
      var trackingInfo = await AdMob.trackingAuthorizationStatus();
      if (trackingInfo.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization();
      }

      var consentInfo = await AdMob.requestConsentInfo();
      if (consentInfo.isConsentFormAvailable && consentInfo.status === 'REQUIRED') {
        consentInfo = await AdMob.showConsentForm();
      }
      if (consentInfo.canRequestAds === false) return; // 同意が取れない場合は広告を出さない

      await AdMob.showBanner({
        adId: BANNER_AD_UNIT_ID_IOS,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: true, // 本番切り替え時にこの行を削除する
      });
    } catch (e) {
      console.warn('[ads] AdMob start failed', e);
    }
  }

  startAds();
})();
