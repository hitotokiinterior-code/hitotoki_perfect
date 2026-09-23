/*
 * hitotoki プッシュ通知(OneSignal)
 * -----------------------------------------------
 * OneSignalを使う理由：
 * 自前でサーバーを立てて配信コードを書く必要がなく、
 * OneSignalの管理画面(ダッシュボード)からポチポチ操作するだけで
 * 「お知らせを配信」できるようになる。Apple側にはOneSignal経由でAPNs証明書
 * (正確にはAPNsキー)を登録するだけでよい。
 *
 * 事前準備(あなたの作業。コードでは代行できません):
 *   1. https://onesignal.com で無料アカウント作成
 *   2. 新しいAppを作成し、iOSプラットフォームを追加
 *      → Apple Developer側で作った「APNs Auth Key(.p8)」をOneSignalにアップロード
 *   3. 発行された「OneSignal App ID」を、下の ONESIGNAL_APP_ID に貼り付ける
 *   4. Xcode側で Push Notifications capability と
 *      Background Modes > Remote notifications を有効にする(後述の手順書参照)
 *
 * 通知を送るときは、OneSignalダッシュボードの「Messages > New Push」から
 * 好きな文言で配信するだけでOK。
 *
 * Web(Vercel)版ではネイティブのpush機能が無いため、このスクリプトは
 * Capacitor.isNativePlatform()がtrueの時だけ動く。
 */
(function () {
  // ⚠️ OneSignalダッシュボードで発行された「OneSignal App ID」に置き換えてください
  var ONESIGNAL_APP_ID = '0824694a-98c6-449f-9e4c-45cd23aa5f7b';

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  if (!isNative()) return; // Web版では何もしない
  if (!window.OneSignal) return;
  if (window.hitotokiPushInitialized) return; // 複数ページで多重初期化しないためのガード
  window.hitotokiPushInitialized = true;

  try {
    window.OneSignal.initialize(ONESIGNAL_APP_ID);

    // 通知の許可プロンプトをすぐに出すとユーザー体験としてはやや唐突なので、
    // 実際の運用では「⚙メニューに『お知らせ通知を受け取る』トグルを置いて、
    // それをONにした時にだけ requestPermission を呼ぶ」のがおすすめです。
    // ここではまず動作確認のため、起動時に一度だけ許可を求めています。
    window.OneSignal.Notifications.requestPermission(true).then(function (accepted) {
      console.log('[push] notification permission accepted:', accepted);
    });
  } catch (e) {
    console.warn('[push] OneSignal init failed', e);
  }
})();
