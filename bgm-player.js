/*
 * hitotoki 共通BGM再生スクリプト（v2）
 * -----------------------------------------------
 * ⚙メニューの「BGM」スイッチがONの間だけ、ループ再生する背景音楽。
 * 各ページは別々のHTMLファイル（ページ遷移のたびにJSは作り直される）なので、
 * 「完全に途切れず鳴り続ける」ことはできないが、以下の工夫で近い体験にしている：
 *
 * - 再生位置を数秒おきに localStorage に保存しておき、次のページではその位置から再生を再開する
 *   （曲の頭に戻らない。ただし音声データの読み込みが終わるまでは位置をセットできないため、
 *   'loadedmetadata' イベントを待ってから復元している）
 * - ブラウザの自動再生制限に対応するため、再生に失敗した場合は最初のタップ/クリックで再試行する
 *   （click / touchstart のどちらか一方だけに反応するようガードし、二重再生を防いでいる）
 * - ⚙メニューのBGMスイッチのON/OFFは 'pref_bgm' キーで判定する。値が 'on' の時だけ再生する
 *   （キーが無い＝初回訪問時はOFFがデフォルト）
 * - このスクリプト自体が誤って2回読み込まれても、Audioインスタンスが2つできて二重に
 *   聞こえることがないよう、初期化を1回だけに制限している
 *
 * 使い方：各ページの </body> 直前に以下を追加するだけ
 *   <script src="bgm-player.js"></script>
 */
(function(){
  // 誤って2回このスクリプトが読み込まれても、Audioインスタンスが2つ生まれないようにする
  if(window.hitotokiBGM) return;

  var BGM_SRC = 'assets/audio/bgm.mp3';
  var POS_KEY = 'hitotoki_bgm_pos';
  var PREF_KEY = 'pref_bgm';
  var VOLUME = 0.25;

  function bgmEnabled(){
    // 'on' の時だけ有効。未設定（初回訪問）や 'off' は無効＝デフォルトOFF
    return localStorage.getItem(PREF_KEY) === 'on';
  }

  var audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = 'auto';

  // 音声データの読み込みが終わったタイミングで、前のページでの再生位置を復元する。
  // ここより前に currentTime をセットすると、読み込み完了時に 0 へリセットされてしまい
  // 「毎回曲の最初から再生される」原因になるため、必ず loadedmetadata を待つ。
  var resumed = false;
  audio.addEventListener('loadedmetadata', function(){
    if(resumed) return;
    resumed = true;
    try{
      var savedPos = parseFloat(localStorage.getItem(POS_KEY));
      if(!isNaN(savedPos) && savedPos > 0 && savedPos < audio.duration){
        audio.currentTime = savedPos;
      }
    }catch(e){}
  });

  function savePosition(){
    try{ localStorage.setItem(POS_KEY, String(audio.currentTime)); }catch(e){}
  }
  setInterval(savePosition, 2000);
  window.addEventListener('pagehide', savePosition);
  document.addEventListener('visibilitychange', function(){
    if(document.hidden) savePosition();
  });

  var retryListenersAttached = false;
  function attachRetryOnce(){
    if(retryListenersAttached) return;
    retryListenersAttached = true;
    var fired = false;
    function resume(){
      if(fired) return; // click と touchstart が両方発火しても、実行は1回だけにする
      fired = true;
      retryListenersAttached = false;
      document.removeEventListener('click', resume);
      document.removeEventListener('touchstart', resume);
      if(bgmEnabled()){ audio.play().catch(function(){}); }
    }
    document.addEventListener('click', resume, { once:true });
    document.addEventListener('touchstart', resume, { once:true });
  }

  function tryPlay(){
    if(!bgmEnabled()) return;
    var p = audio.play();
    if(p && p.catch){
      p.catch(function(){
        // 自動再生がブロックされた場合は、最初のタップ/クリックで再試行する
        attachRetryOnce();
      });
    }
  }

  function stopBgm(){
    audio.pause();
    savePosition();
  }

  tryPlay();

  // ⚙メニューのBGMスイッチなど、他のスクリプトから直接on/offできるように公開しておく
  window.hitotokiBGM = {
    play: tryPlay,
    stop: stopBgm,
    audio: audio,
  };
})();
