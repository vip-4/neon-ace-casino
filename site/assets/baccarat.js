/* Neon Ace — Baccarat (百家樂) Canvas 示範
 * 架構：OutcomeProvider(結果來源) / Shoe(牌靴) / BaccaratEngine(FSM+規則) /
 *       Renderer(Canvas 繪製) / ViewManager(DPR+Resize) / GameLoop(固定步長)
 *
 * ⚠️ 安全邊界：本頁為「虛擬籌碼展示」。RNG 與派彩在前端以 Web Crypto 產生，
 * 僅供娛樂練習；任何真金/排名/兌換/跨裝置場景，必須改為後端權威 RNG、派彩與簽章，
 * 前端只負責演出與驗章，不得信任客戶端結算結果。
 */
(function () {
  'use strict';

  // ---------- 常數與工具 ----------
  var CFG = {
    DECKS: 8,               // 標準百家樂常用 8 副牌
    CUT_CARDS: 16,          // 切牌後剩餘張數低於此值即重洗
    START_BANKROLL: 1000,
    BETS: [10, 25, 50, 100],
    MAX_DPR: 2,
    FIXED_DT: 1 / 120,
    MAX_FRAME_DT: 0.05,
    MAX_SUBSTEPS: 8,
    DEAL_INTERVAL: 0.42,    // 發牌節奏（秒）
    FLIP_TIME: 0.28,
    SLIDE_TIME: 0.32,
    RESULT_HOLD: 1.6
  };
  var SUITS = ['♠', '♥', '♦', '♣'];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var STATE = {
    IDLE: 'IDLE', BETTING: 'BETTING', DEALING: 'DEALING',
    PLAYER_THIRD: 'PLAYER_THIRD', BANKER_THIRD: 'BANKER_THIRD',
    REVEAL: 'REVEAL', SETTLE: 'SETTLE'
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1, u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }
  function fmt(n) {
    var v = Math.round(n * 100) / 100;
    return (Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : v.toFixed(2));
  }
  function $(id) { return document.getElementById(id); }

  // ---------- 音效（手勢解鎖，避免行動端自動播放限制） ----------
  var Sfx = {
    ctx: null, on: false,
    unlock: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    beep: function (f, d, g) {
      if (!this.on || !this.ctx) return;
      try {
        var o = this.ctx.createOscillator(), v = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; v.gain.value = g || 0.03;
        o.connect(v); v.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime + (d || 0.06));
      } catch (e) {}
    },
    deal: function () { this.beep(720, 0.04, 0.02); },
    win: function () { this.beep(880, 0.08, 0.04); setTimeout(function(){ Sfx.beep(1100,0.1,0.04); }, 90); },
    lose: function () { this.beep(220, 0.12, 0.03); }
  };

  // ---------- 牌靴：Fisher–Yates + Web Crypto（展示用） ----------
  function Shoe() { this.cards = []; this.reshuffle(); }
  Shoe.prototype.reshuffle = function () {
    var arr = [];
    for (var d = 0; d < CFG.DECKS; d++) {
      for (var s = 0; s < 4; s++) for (var r = 0; r < 13; r++) arr.push({ r: r, s: s });
    }
    // 加密亂數洗牌；真金環境必須由伺服器產生並簽章
    var n = arr.length, rand = new Uint32Array(1);
    for (var i = n - 1; i > 0; i--) {
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(rand);
      else rand[0] = Math.floor(Math.random() * 4294967296);
      var j = rand[0] % (i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    this.cards = arr;
  };
  Shoe.prototype.draw = function () {
    if (this.cards.length <= CFG.CUT_CARDS) this.reshuffle();
    return this.cards.pop();
  };
  Shoe.prototype.baccaratValue = function (c) {
    // A=1, 2-9 面值, 10/J/Q/K=0
    if (c.r === 0) return 1;
    if (c.r >= 9) return 0;
    return c.r + 1;
  };
  Shoe.prototype.handTotal = function (hand) {
    var sum = 0;
    for (var i = 0; i < hand.length; i++) sum += this.baccaratValue(hand[i]);
    return sum % 10; // 百家樂只取個位數
  };

  // ---------- 結果來源介面（可替換為後端） ----------
  function LocalOutcomeProvider(shoe) { this.shoe = shoe; }
  LocalOutcomeProvider.prototype.deal = function () {
    // 模擬後端回傳：前端只應消費已決定的結果；此處為離線展示才在本地產生
    return {
      player: [this.shoe.draw(), this.shoe.draw()],
      banker: [this.shoe.draw(), this.shoe.draw()],
      // 補牌在引擎依規則計算（展示用）；正式版應由伺服器一併給定每一步
      seq: Date.now()
    };
  };

  // ---------- 引擎：FSM + 補牌規則 + 結算 ----------
  function Engine() {
    this.shoe = new Shoe();
    this.provider = new LocalOutcomeProvider(this.shoe);
    this.resetRound();
    this.bankroll = CFG.START_BANKROLL;
    this.stats = { hands: 0, won: 0, best: CFG.START_BANKROLL };
  }
  Engine.prototype.resetRound = function () {
    this.state = STATE.BETTING;
    this.player = []; this.banker = [];
    this.bet = { player: 0, banker: 0, tie: 0 };
    this.result = null; // {winner, pTotal,bTotal, payout, net, natural}
    this.queue = []; this.queueIdx = 0; this.timer = 0; this.hold = 0;
    this.draws = { p3: null, b3: null };
  };
  Engine.prototype.totalBet = function () { return this.bet.player + this.bet.banker + this.bet.tie; };
  Engine.prototype.canDeal = function () { return this.state === STATE.BETTING && this.totalBet() > 0 && this.totalBet() <= this.bankroll; };

  // 第三張牌規則（Punto Banco 標準）
  Engine.prototype.needsPlayerThird = function () { return this.shoe.handTotal(this.player) <= 5; };
  Engine.prototype.needsBankerThird = function (p3) {
    var bt = this.shoe.handTotal(this.banker);
    if (bt <= 2) return true;
    if (bt === 3) return p3 !== 8;
    if (bt === 4) return p3 >= 2 && p3 <= 7;
    if (bt === 5) return p3 >= 4 && p3 <= 7;
    if (bt === 6) return p3 === 6 || p3 === 7;
    return false; // 7 停牌
  };

  Engine.prototype.startDeal = function () {
    if (!this.canDeal()) return false;
    var out = this.provider.deal();
    this.player = [out.player[0], out.player[1]];
    this.banker = [out.banker[0], out.banker[1]];
    this.state = STATE.DEALING;
    // 發牌順序：閒、莊、閒、莊（視覺佇列）
    this.queue = [
      { side: 'player', card: this.player[0] },
      { side: 'banker', card: this.banker[0] },
      { side: 'player', card: this.player[1] },
      { side: 'banker', card: this.banker[1] }
    ];
    this.visible = { player: 0, banker: 0 };
    this.queueIdx = 0; this.timer = 0; this.draws = { p3: null, b3: null };
    return true;
  };

  Engine.prototype.afterInitial = function () {
    var pt = this.shoe.handTotal(this.player), bt = this.shoe.handTotal(this.banker);
    // 天牌 8/9：直接結算
    if (pt >= 8 || bt >= 8) { this.finish(); return; }
    if (this.needsPlayerThird()) {
      var c = this.shoe.draw(); this.player.push(c); this.draws.p3 = this.shoe.baccaratValue(c);
      this.queue.push({ side: 'player', card: c });
      this.state = STATE.PLAYER_THIRD; this.timer = 0; return;
    }
    if (this.needsBankerThird(-1)) { // 閒未補牌時視為無影響，莊 0-5 補、6-7 停
      // 依規則：閒停牌則莊 0-5 補
      var bt2 = this.shoe.handTotal(this.banker);
      if (bt2 <= 5) {
        var cb = this.shoe.draw(); this.banker.push(cb);
        this.queue.push({ side: 'banker', card: cb });
        this.state = STATE.BANKER_THIRD; this.timer = 0; return;
      }
    }
    this.finish();
  };

  Engine.prototype.afterPlayerThird = function () {
    if (this.needsBankerThird(this.draws.p3)) {
      var c = this.shoe.draw(); this.banker.push(c);
      this.queue.push({ side: 'banker', card: c });
      this.state = STATE.BANKER_THIRD; this.timer = 0; return;
    }
    this.finish();
  };

  Engine.prototype.finish = function () {
    var pt = this.shoe.handTotal(this.player), bt = this.shoe.handTotal(this.banker);
    var winner = pt > bt ? 'player' : (bt > pt ? 'banker' : 'tie');
    var natural = (this.player.length === 2 && this.banker.length === 2 && (pt >= 8 || bt >= 8));
    // 結算（虛擬籌碼）
    var winAmount = 0, loseAmount = 0;
    // 閒：1:1；莊：1:1 扣 5% 佣金；和：8:1（常見娛樂桌），和局時閒/莊退回
    if (winner === 'player') { winAmount += this.bet.player; loseAmount += this.bet.banker + this.bet.tie; }
    else if (winner === 'banker') { winAmount += this.bet.banker * 0.95; loseAmount += this.bet.player + this.bet.tie; }
    else { winAmount += this.bet.tie * 8; /* 閒/莊退回，不計輸贏 */ }
    var net = winAmount - loseAmount;
    this.bankroll = Math.round((this.bankroll + net) * 100) / 100;
    this.stats.hands++;
    if (net > 0) this.stats.won++;
    if (this.bankroll > this.stats.best) this.stats.best = this.bankroll;
    this.result = { winner: winner, pTotal: pt, bTotal: bt, net: net, natural: natural };
    this.state = STATE.REVEAL; this.hold = 0;
  };

  Engine.prototype.update = function (dt) {
    if (this.state === STATE.DEALING || this.state === STATE.PLAYER_THIRD || this.state === STATE.BANKER_THIRD) {
      this.timer += dt;
      if (this.timer >= CFG.DEAL_INTERVAL) {
        this.timer -= CFG.DEAL_INTERVAL;
        // 佇列中下一張轉為可見
        if (this.queueIdx < this.queue.length) {
          var it = this.queue[this.queueIdx++];
          if (it.side === 'player') this.visible.player = Math.min(this.visible.player + 1, this.player.length);
          else this.visible.banker = Math.min(this.visible.banker + 1, this.banker.length);
          Sfx.deal();
        }
        // 當前階段牌已發完則進入下一決策
        if (this.queueIdx >= this.queue.length) {
          if (this.state === STATE.DEALING) this.afterInitial();
          else if (this.state === STATE.PLAYER_THIRD) this.afterPlayerThird();
          else if (this.state === STATE.BANKER_THIRD) this.finish();
        }
      }
    } else if (this.state === STATE.REVEAL) {
      this.hold += dt;
      if (this.hold >= CFG.RESULT_HOLD) this.state = STATE.SETTLE;
    }
  };

  // ---------- 繪製 ----------
  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1; this.w = 720; this.h = 420; this.scale = 1; this._lastW = -1; this._lastH = -1; this._lastDpr = -1;
  }
  Renderer.prototype.resize = function (wrapW) {
    var cssW = Math.max(300, Math.min(760, wrapW));
    var cssH = Math.round(cssW * 0.56);
    var dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    if (cssW === this._lastW && cssH === this._lastH && dpr === this._lastDpr) return; // 尺寸/DPR 未變不重設，避免緩衝區清空
    this.dpr = dpr; this.w = cssW; this.h = cssH; this.scale = cssW / 720;
    var bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._lastW = cssW; this._lastH = cssH; this._lastDpr = dpr;
  };
  Renderer.prototype.clear = function () {
    var c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    var g = c.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, '#0f3d2f'); g.addColorStop(1, '#08261d');
    c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);
    // 桌面弧線裝飾
    c.strokeStyle = 'rgba(232,200,121,0.18)'; c.lineWidth = 2;
    c.beginPath(); c.arc(this.w / 2, -this.h * 0.55, this.h * 1.25, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  };
  Renderer.prototype.drawLabel = function (text, x, y, color, size) {
    var c = this.ctx; c.fillStyle = color || '#f5efe2';
    c.font = (size || 16) + 'px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y);
  };
  Renderer.prototype.drawCard = function (card, x, y, w, h, face) {
    var c = this.ctx, r = 8 * this.scale;
    c.save(); c.translate(x, y);
    c.fillStyle = '#f6f1e7'; c.strokeStyle = '#d8cfbf'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-w/2+r, -h/2); c.lineTo(w/2-r, -h/2); c.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);
    c.lineTo(w/2, h/2-r); c.quadraticCurveTo(w/2,h/2,w/2-r,h/2);
    c.lineTo(-w/2+r, h/2); c.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);
    c.lineTo(-w/2,-h/2+r); c.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    c.closePath(); c.fill(); c.stroke();
    if (face && card) {
      var red = (card.s === 1 || card.s === 2);
      c.fillStyle = red ? '#c53b3b' : '#17212b';
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.font = 'bold ' + Math.round(16 * this.scale) + 'px system-ui, sans-serif';
      c.fillText(RANKS[card.r] + SUITS[card.s], -w/2 + 6*this.scale, -h/2 + 5*this.scale);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = Math.round(28 * this.scale) + 'px system-ui, sans-serif';
      c.fillText(SUITS[card.s], 0, 4*this.scale);
    } else {
      c.fillStyle = '#123b2e'; c.fillRect(-w/2+5, -h/2+5, w-10, h-10);
      c.strokeStyle = 'rgba(232,200,121,0.5)'; c.strokeRect(-w/2+8, -h/2+8, w-16, h-16);
    }
    c.restore();
  };
  Renderer.prototype.drawHand = function (cards, count, x, y, total, label, highlight) {
    var cw = 64 * this.scale, ch = 90 * this.scale, gap = 18 * this.scale;
    var n = Math.max(count, 0), totalW = n > 0 ? (n - 1) * (cw * 0.55 + gap) + cw : cw;
    var startX = x - totalW / 2 + cw / 2;
    for (var i = 0; i < n; i++) {
      this.drawCard(cards[i], startX + i * (cw * 0.55 + gap), y, cw, ch, true);
    }
    this.drawLabel(label, x, y - ch / 2 - 18 * this.scale, '#a9c3b7', Math.round(13 * this.scale));
    if (count >= 2) {
      var pill = String(total);
      var c = this.ctx, pw = 34 * this.scale, ph = 22 * this.scale, py = y + ch / 2 + 16 * this.scale;
      c.fillStyle = highlight ? '#e8c879' : 'rgba(245,239,226,0.12)';
      c.beginPath();
      c.moveTo(x - pw/2 + 8, py - ph/2); c.lineTo(x + pw/2 - 8, py - ph/2);
      c.quadraticCurveTo(x + pw/2, py - ph/2, x + pw/2, py);
      c.quadraticCurveTo(x + pw/2, py + ph/2, x + pw/2 - 8, py + ph/2);
      c.lineTo(x - pw/2 + 8, py + ph/2);
      c.quadraticCurveTo(x - pw/2, py + ph/2, x - pw/2, py);
      c.quadraticCurveTo(x - pw/2, py - ph/2, x - pw/2 + 8, py - ph/2);
      c.fill();
      this.drawLabel(pill, x, py + 1, highlight ? '#06110e' : '#f5efe2', Math.round(13 * this.scale));
    }
  };
  Renderer.prototype.render = function (eng) {
    this.clear();
    var mid = this.w / 2;
    var py = this.h * 0.62, by = this.h * 0.28;
    var pCount = eng.visible ? eng.visible.player : eng.player.length;
    var bCount = eng.visible ? eng.visible.banker : eng.banker.length;
    var pTotal = eng.shoe.handTotal(eng.player.slice(0, pCount));
    var bTotal = eng.shoe.handTotal(eng.banker.slice(0, bCount));
    var win = eng.result ? eng.result.winner : null;
    this.drawHand(eng.banker, bCount, mid, by, bTotal, '莊家 Banker', win === 'banker');
    this.drawHand(eng.player, pCount, mid, py, pTotal, '閒家 Player', win === 'player');
    // 中央提示
    var msg = '';
    if (eng.state === STATE.BETTING) msg = '選擇籌碼與下注區，然後發牌';
    else if (eng.state === STATE.DEALING || eng.state === STATE.PLAYER_THIRD || eng.state === STATE.BANKER_THIRD) msg = '發牌中…';
    else if (eng.state === STATE.REVEAL || eng.state === STATE.SETTLE) {
      if (!eng.result) msg = '';
      else if (eng.result.winner === 'tie') msg = '和局 Tie — ' + eng.result.pTotal + ' : ' + eng.result.bTotal;
      else msg = (eng.result.winner === 'player' ? '閒家贏 Player' : '莊家贏 Banker') + ' — ' + eng.result.pTotal + ' : ' + eng.result.bTotal + (eng.result.natural ? '（天牌）' : '');
    }
    if (msg) {
      var c = this.ctx; c.fillStyle = 'rgba(6,17,14,0.55)';
      var tw = Math.min(this.w - 40, c.measureText(msg).width + 220 * this.scale);
      c.font = Math.round(14 * this.scale) + 'px system-ui, sans-serif';
      tw = Math.min(this.w - 30, c.measureText(msg).width + 28 * this.scale);
      var bx = mid - tw/2, bh = 30 * this.scale, bY = this.h * 0.46 - bh/2;
      c.fillRect(bx, bY, tw, bh);
      this.drawLabel(msg, mid, this.h * 0.46, '#f5efe2', Math.round(14 * this.scale));
    }
  };

  // ---------- 主控制器 ----------
  function Game() {
    this.eng = new Engine();
    this.canvas = $('baccarat-canvas');
    this.wrap = $('baccarat-demo');
    this.renderer = new Renderer(this.canvas);
    this.statusEl = $('game-status');
    this.bankrollEl = $('bankroll');
    this.totalBetEl = $('total-bet');
    this.dealBtn = $('deal-btn');
    this.clearBtn = $('clear-btn');
    this.newBtn = $('new-btn'); // 可選：頁面未提供時由 Deal 按鈕兼任新一局
    this.soundBtn = $('sound-btn');
    this.selectedChip = 25;
    this.running = false; this.last = 0; this.acc = 0;
    this.load();
    this.bind();
    this.renderer.resize(this.wrap.clientWidth || 720);
    this.syncUI();
    this.loop = this.loop.bind(this);
    this.running = true; requestAnimationFrame(this.loop);
    // 初始靜態畫面
    this.eng.visible = { player: 0, banker: 0 };
    this.renderer.render(this.eng);
  }
  Game.prototype.load = function () {
    try {
      var raw = localStorage.getItem('neonace_baccarat_v1');
      if (raw) {
        var d = JSON.parse(raw);
        if (d && typeof d.bankroll === 'number' && d.bankroll >= 0) this.eng.bankroll = d.bankroll;
        if (d && d.stats) { this.eng.stats.hands = d.stats.hands|0; this.eng.stats.won = d.stats.won|0; this.eng.stats.best = d.stats.best || this.eng.bankroll; }
        if (d && typeof d.sound === 'boolean') Sfx.on = d.sound;
      }
    } catch (e) {}
  };
  Game.prototype.save = function () {
    try { localStorage.setItem('neonace_baccarat_v1', JSON.stringify({ bankroll: this.eng.bankroll, stats: this.eng.stats, sound: Sfx.on })); } catch (e) {}
  };
  Game.prototype.bind = function () {
    var self = this;
    // 籌碼選擇
    var chips = document.querySelectorAll('[data-chip]');
    for (var i = 0; i < chips.length; i++) (function (btn) {
      btn.addEventListener('click', function () {
        self.selectedChip = parseInt(btn.getAttribute('data-chip'), 10) || 25;
        for (var j = 0; j < chips.length; j++) chips[j].setAttribute('aria-pressed', chips[j] === btn ? 'true' : 'false');
      });
    })(chips[i]);
    // 下注區
    [['bet-player','player'],['bet-banker','banker'],['bet-tie','tie']].forEach(function (pair) {
      var el = $(pair[0]); if (!el) return;
      el.addEventListener('click', function () { self.place(pair[1]); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.place(pair[1]); } });
    });
    this.dealBtn.addEventListener('click', function () { self.deal(); });
    this.clearBtn.addEventListener('click', function () { self.clearBets(); });
    if (this.newBtn) this.newBtn.addEventListener('click', function () { self.newRound(); });
    this.soundBtn.addEventListener('click', function () {
      Sfx.unlock(); Sfx.on = !Sfx.on; self.save(); self.syncUI();
    });
    var rebet = $('rebet-btn'); if (rebet) rebet.addEventListener('click', function(){ self.clearBets(); });
    // Resize：ResizeObserver + rAF 合併，並偵測 DPR 變化（跨螢幕/縮放）
    this._resizeRaf = 0;
    var scheduleResize = function () {
      if (self._resizeRaf) return;
      self._resizeRaf = requestAnimationFrame(function () { self._resizeRaf = 0; self.renderer.resize(self.wrap.clientWidth || 720); self.renderer.render(self.eng); });
    };
    if (typeof ResizeObserver !== 'undefined' && this.wrap) { this._ro = new ResizeObserver(scheduleResize); this._ro.observe(this.wrap); }
    else { window.addEventListener('resize', scheduleResize); }
    var bindDpr = function () {
      if (self._dprMq) { if (self._dprMq.removeEventListener) self._dprMq.removeEventListener('change', onDpr); else if (self._dprMq.removeListener) self._dprMq.removeListener(onDpr); }
      if (!window.matchMedia) return;
      self._dprMq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
      if (self._dprMq.addEventListener) self._dprMq.addEventListener('change', onDpr); else if (self._dprMq.addListener) self._dprMq.addListener(onDpr);
    };
    var onDpr = function () { bindDpr(); scheduleResize(); };
    bindDpr();
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { self.running = false; }
      else { self.running = true; self.last = 0; self.acc = 0; requestAnimationFrame(self.loop); }
    });
  };
  Game.prototype.place = function (area) {
    Sfx.unlock();
    if (this.eng.state !== STATE.BETTING) return;
    var next = this.eng.totalBet() + this.selectedChip;
    if (next > this.eng.bankroll) { this.setStatus('籌碼不足，無法加注。'); return; }
    this.eng.bet[area] += this.selectedChip;
    this.syncUI();
  };
  Game.prototype.clearBets = function () {
    if (this.eng.state !== STATE.BETTING) return;
    this.eng.bet = { player: 0, banker: 0, tie: 0 }; this.syncUI();
  };
  Game.prototype.deal = function () {
    Sfx.unlock();
    if (this.eng.state === STATE.SETTLE) { this.newRound(); }
    if (!this.eng.startDeal()) { this.setStatus('請先下注（總注額需 > 0 且 ≤ 餘額）。'); return; }
    this.setStatus('發牌中：閒、莊、閒、莊…');
    this.syncUI();
  };
  Game.prototype.newRound = function () {
    if (this.eng.state !== STATE.BETTING && this.eng.state !== STATE.SETTLE) return;
    var keep = this.eng.bankroll, stats = this.eng.stats;
    this.eng.resetRound(); this.eng.bankroll = keep; this.eng.stats = stats;
    this.eng.visible = { player: 0, banker: 0 };
    this.setStatus('新一局：請下注。');
    this.syncUI(); this.renderer.render(this.eng);
  };
  Game.prototype.setStatus = function (t) { if (this.statusEl) this.statusEl.textContent = t; };
  Game.prototype.syncUI = function () {
    if (this.bankrollEl) this.bankrollEl.textContent = fmt(this.eng.bankroll);
    if (this.totalBetEl) this.totalBetEl.textContent = fmt(this.eng.totalBet());
    var map = { player: 'bet-player-amt', banker: 'bet-banker-amt', tie: 'bet-tie-amt' };
    for (var k in map) { var el = $(map[k]); if (el) el.textContent = this.eng.bet[k] ? fmt(this.eng.bet[k]) : '—'; }
    var can = this.eng.canDeal();
    this.dealBtn.disabled = !(can || this.eng.state === STATE.SETTLE);
    this.dealBtn.textContent = this.eng.state === STATE.SETTLE ? '新一局' : '發牌 Deal';
    this.clearBtn.disabled = (this.eng.state !== STATE.BETTING || this.eng.totalBet() === 0);
    var canAct = (this.eng.state === STATE.BETTING);
    ['bet-player','bet-banker','bet-tie'].forEach(function(id){ var el=$(id); if(el){ el.setAttribute('aria-disabled', canAct?'false':'true'); }});
    if (this.soundBtn) { this.soundBtn.setAttribute('aria-pressed', Sfx.on ? 'true' : 'false'); this.soundBtn.textContent = '音效 Sound：' + (Sfx.on ? '開' : '關'); }
    var sh = $('stat-hands'), sw = $('stat-won'), sb = $('stat-best');
    if (sh) sh.textContent = String(this.eng.stats.hands);
    if (sw) sw.textContent = String(this.eng.stats.won);
    if (sb) sb.textContent = fmt(this.eng.stats.best);
    if (this.eng.state === STATE.SETTLE && this.eng.result) {
      var r = this.eng.result, who = r.winner === 'player' ? '閒家' : (r.winner === 'banker' ? '莊家' : '和局');
      var netTxt = r.net > 0 ? ('淨贏 +' + fmt(r.net)) : (r.net < 0 ? ('淨輸 ' + fmt(r.net)) : '淨和 0');
      this.setStatus('結果：' + who + '（' + r.pTotal + ' : ' + r.bTotal + '）· ' + netTxt + '。按「新一局」繼續。');
      if (r.net > 0) Sfx.win(); else if (r.net < 0) Sfx.lose();
      this.save();
    }
  };
  Game.prototype.loop = function (ts) {
    if (!this.running) return;
    if (!this.last) this.last = ts;
    var dt = Math.min(CFG.MAX_FRAME_DT, (ts - this.last) / 1000);
    this.last = ts; this.acc += dt;
    var steps = 0;
    while (this.acc >= CFG.FIXED_DT && steps < CFG.MAX_SUBSTEPS) {
      var prev = this.eng.state;
      this.eng.update(CFG.FIXED_DT);
      if (this.eng.state !== prev) this.syncUI();
      this.acc -= CFG.FIXED_DT; steps++;
    }
    if (steps === CFG.MAX_SUBSTEPS) this.acc = 0; // 防死亡螺旋
    this.renderer.render(this.eng);
    requestAnimationFrame(this.loop);
  };

  // 啟動
  function boot() {
    if (!$('baccarat-canvas')) return;
    window.__neonBaccarat = new Game();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
