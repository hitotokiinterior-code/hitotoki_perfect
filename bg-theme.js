/*
 * hitotoki 共通BGM再生スクリプト
 * -----------------------------------------------
 * ⚙メニューの「BGM」スイッチがONの間、ループ再生する背景音楽。
 * 各ページは別々のHTMLファイル（ページ遷移のたびにJSは作り直される）なので、
 * 「完全に途切れず鳴り続ける」ことはできないが、以下の工夫で近い体験にしている：
 *
 * - 再生位置を数秒おきに localStorage に保存しておき、次のページではその位置から再生を再開する
 *   （曲の頭に戻らない）
 * - ブラウザの自動再生制限に対応するため、再生に失敗した場合は最初のタップ/クリックで再試行する
 * - ⚙メニューのBGMスイッチのON/OFFは 'pref_bgm' キー（'off'ならOFF、それ以外はON）を共有する
 *
 * 使い方：各ページの </body> 直前に以下を追加するだけ
 *   <script src="bgm-player.js"></script>
 */
(function(){
  var BGM_SRC = 'assets/audio/bgm.mp3';
  var POS_KEY = 'hitotoki_bgm_pos';
  var PREF_KEY = 'pref_bgm';
  var VOLUME = 0.35;

  function bgmEnabled(){
    return localStorage.getItem(PREF_KEY) === 'on';
  }

  var audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.volume = VOLUME;
  audio.preload = 'auto';

  // 前のページでの再生位置から続きを再生する
  try{
    var savedPos = parseFloat(localStorage.getItem(POS_KEY));
    if(!isNaN(savedPos) && savedPos > 0){
      audio.currentTime = savedPos;
    }
  }catch(e){}

  function savePosition(){
    try{ localStorage.setItem(POS_KEY, String(audio.currentTime)); }catch(e){}
  }
  var posInterval = setInterval(savePosition, 2000);
  window.addEventListener('pagehide', savePosition);
  document.addEventListener('visibilitychange', function(){
    if(document.hidden) savePosition();
  });

  function tryPlay(){
    if(!bgmEnabled()) return;
    var p = audio.play();
    if(p && p.catch){
      p.catch(function(){
        // 自動再生がブロックされた場合は、最初のタップ/クリックで再試行する
        function resume(){
          if(bgmEnabled()){ audio.play().catch(function(){}); }
          document.removeEventListener('click', resume);
          document.removeEventListener('touchstart', resume);
        }
        document.addEventListener('click', resume, { once:true });
        document.addEventListener('touchstart', resume, { once:true });
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
