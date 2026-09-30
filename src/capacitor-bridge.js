// =========================================================
// capacitor-bridge.js (ビルド元ファイル)
// ---------------------------------------------------------
// このプロジェクトはWebpackなどのフレームワークを使わない
// 素のHTML/JS構成なので、npmでインストールしたCapacitorの
// プラグイン(@capacitor/core, @capacitor/app, @capacitor/push-notifications,
// @capacitor-community/admob, @revenuecat/purchases-capacitor)を、
// 各HTMLページから<script>タグ1本で使えるように、esbuildで1つの
// JSファイルにまとめておく。
//
// ビルド方法: npm run build:bridge
//   → ルートに capacitor-bridge.js が生成される(全ページで読み込む)
//
// これをimportするだけで、各プラグインが内部でCapacitor本体に
// 自己登録され、window.Capacitor.Plugins.App / PushNotifications / AdMob
// が使えるようになる。Web(Vercel)側で開いた場合はCapacitor.isNativePlatform()
// がfalseになるので、他のスクリプト側でネイティブ限定の処理は
// isNativePlatform()チェックでガードすること。
// =========================================================
import { Capacitor } from '@capacitor/core';
import '@capacitor/app';
import OneSignal from '@onesignal/capacitor-plugin';
import { AdMob } from '@capacitor-community/admob';
import { Purchases } from '@revenuecat/purchases-capacitor';

window.Capacitor = Capacitor;
window.OneSignal = OneSignal;
window.AdMob = AdMob;
window.Purchases = Purchases;
