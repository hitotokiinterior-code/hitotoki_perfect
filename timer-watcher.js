/*
 * hitotoki 共通タイマー監視スクリプト
 * -----------------------------------------------
 * ホーム画面（index.html）のタイマーが動いている間、他のゲームページに
 * 移動していても「時間になりました」を知らせるための仕組み。
 *
 * 仕組み：
 * - index.html はタイマーを開始すると、終了時刻（絶対時刻のミリ秒）を
 *   localStorage の 'hitotoki_timer' キーに保存する
 * - このスクリプトを読み込んだページは、1秒おきにその時刻を過ぎていないか
 *   チェックし、過ぎていたらポップアップを表示してキーを削除する
 * - 音は鳴らさず、端末の振動設定（'pref_vibration'）に従って振動のみ行う
 *
 * 使い方：各ゲームページの </body> 直前に以下を追加するだけ
 *   <script src="timer-watcher.js"></script>
 */
(function(){
  var STORAGE_KEY = 'hitotoki_timer';

  function vibrationAllowed(){
    return localStorage.getItem('pref_vibration') !== 'off';
  }

  function showTimerPopup(){
    if(document.getElementById('hitotokiTimerPopup')) return;

    var overlay = document.createElement('div');
    overlay.id = 'hitotokiTimerPopup';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);' +
      'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
      'font-family:"Zen Kaku Gothic New",sans-serif;';

    var card = document.createElement('div');
    card.style.cssText =
      'background:linear-gradient(160deg,#232016,#141210 55%,#030302);' +
      'border:1px solid rgba(255,255,255,0.14);' +
      'border-radius:12px;' +
      'padding:32px 28px;' +
      'max-width:280px;width:80%;' +
      'text-align:center;' +
      'box-shadow:0 12px 30px rgba(0,0,0,0.5);';

    var icon = document.createElement('img');
    icon.src = 'assets/icons/timer_popup_watch.png';
    icon.alt = '';
    icon.style.cssText = 'width:56px;height:auto;margin-bottom:12px;';

    var title = document.createElement('div');
    title.textContent = '時間になりました';
    title.style.cssText =
      'font-family:"Kaisei Decol",serif;font-size:1.05rem;' +
      'color:#fff;letter-spacing:0.05em;margin-bottom:8px;';

    var desc = document.createElement('div');
    desc.textContent = 'タイマーが終了しました';
    desc.style.cssText =
      'font-size:0.75rem;color:#9a9a9a;letter-spacing:0.03em;margin-bottom:22px;';

    var btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.cssText =
      'width:100%;padding:11px;border-radius:7px;' +
      'border:1px solid #fff;background:#fff;color:#141414;' +
      'font-family:"Zen Kaku Gothic New",sans-serif;font-size:0.8rem;' +
      'font-weight:700;letter-spacing:0.05em;cursor:pointer;';
    btn.addEventListener('click', function(){ overlay.remove(); });

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    if(vibrationAllowed() && navigator.vibrate){
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }

  function checkTimer(){
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;

    var data;
    try{ data = JSON.parse(raw); }
    catch(e){ localStorage.removeItem(STORAGE_KEY); return; }

    if(!data || !data.endTime) return;

    if(Date.now() >= data.endTime){
      localStorage.removeItem(STORAGE_KEY);
      showTimerPopup();
    }
  }

  checkTimer();
  setInterval(checkTimer, 1000);
})();
