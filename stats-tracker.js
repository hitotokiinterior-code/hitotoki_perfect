/*
 * hitotoki 共通記録スクリプト（v2）
 * -----------------------------------------------
 * 各ゲームが対局を終えるたびに呼び出して、記録タブ（ホーム画面下部の「記録」）に
 * 表示する統計情報を localStorage に蓄積しておくための仕組み。
 *
 * v2では「個々のプレイ履歴」をそのまま配列で保持し、総プレイ数・勝率・今月のプレイ数・
 * 連勝記録・直近の履歴一覧など、記録タブに必要な数値は表示側（index.html）が
 * この履歴から都度計算する。集計値を別々に持たないので、ズレが起きにくい。
 *
 * 保存データ（キー: 'hitotoki_stats'）:
 * {
 *   version: 2,
 *   firstPlayedAt: "2026-09-01T12:34:56.000Z",   // 初めて記録された日時（以後変わらない）
 *   history: [
 *     {
 *       gameId: "mini_shogi",
 *       title: "ミニ将棋",
 *       ts: 1735689600000,     // 対局終了時刻（ミリ秒）
 *       vsCPU: true,
 *       won: true,            // true=勝ち / false=負け / null=引き分け・2人対戦など判定なし
 *       durationSec: 185,     // 対局時間（秒）。取得できない場合は null
 *     },
 *     ...
 *   ]
 * }
 * 直近 MAX_HISTORY 件だけを保持し、それより古い記録は自動的に切り捨てる。
 *
 * 使い方：各ゲームの </body> 直前に追加する
 *   <script src="stats-tracker.js"></script>
 *
 * そのうえで、対局が終わったタイミングで1回だけ呼び出す：
 *   window.hitotokiStats.recordGameEnd('mini_shogi', 'ミニ将棋', {
 *     vsCPU: true,
 *     won: true,            // vsCPU:true の時、プレイヤー視点で勝ったか（引き分けは省略可）
 *     durationSec: 185,     // 対局にかかった秒数（分かる場合のみ）
 *   });
 *
 * 2人対戦（vsCPUなし）の場合は { } のみ、または省略してよい（wonはnull扱いになる）。
 */
(function(){
  var KEY = 'hitotoki_stats';
  var MAX_HISTORY = 500;
  var SCHEMA_VERSION = 2;

  function loadStats(){
    try{
      var raw = localStorage.getItem(KEY);
      if(raw){
        var parsed = JSON.parse(raw);
        if(parsed && parsed.version === SCHEMA_VERSION && Array.isArray(parsed.history)){
          return parsed;
        }
      }
    }catch(e){}
    return { version: SCHEMA_VERSION, firstPlayedAt: null, history: [] };
  }

  function saveStats(stats){
    try{ localStorage.setItem(KEY, JSON.stringify(stats)); }catch(e){}
  }

  function recordGameEnd(gameId, title, opts){
    opts = opts || {};
    var stats = loadStats();

    if(!stats.firstPlayedAt){
      stats.firstPlayedAt = new Date().toISOString();
    }

    var won = null;
    if(opts.won === true) won = true;
    else if(opts.won === false) won = false;

    stats.history.push({
      gameId: gameId,
      title: title,
      ts: Date.now(),
      vsCPU: !!opts.vsCPU,
      won: won,
      durationSec: (typeof opts.durationSec === 'number' && !isNaN(opts.durationSec)) ? opts.durationSec : null,
    });

    if(stats.history.length > MAX_HISTORY){
      stats.history = stats.history.slice(stats.history.length - MAX_HISTORY);
    }

    saveStats(stats);
    return stats;
  }

  window.hitotokiStats = {
    load: loadStats,
    recordGameEnd: recordGameEnd,
  };
})();
