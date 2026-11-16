/*
 * Neon Ace 鈥?鍘熺敓 HTML5 Canvas 鑰佽檸姗熸痪杓瘎渚嬶紙3 鍒?脳 5 杓級
 * ------------------------------------------------------------------
 * 鏋舵鍒嗗堡锛堥珮鍏ц仛銆佷綆鑰﹀悎锛夛細
 *   OutcomeProvider  -> 绲愭灉渚嗘簮锛堝睍绀虹敤鑵虫湰 / 姝ｅ紡鐢ㄥ緦绔?API锛? *   Reel             -> 鍠吉鐗╃悊锛氬姞閫?鈫?鍕婚€?鈫?easeOutBack 鍥炲綀鍋滄
 *   CoinPool         -> 闋愰厤缃殑閲戝梗绮掑瓙姹狅紝娓叉煋杩村湀鍏ч浂閰嶇疆
 *   BigWinFX         -> 鍏ㄨ灑骞曟叾绁濓細鏆楀寲 + 鎷嬬墿绶氶噾骞?+ 鏁稿瓧 tween
 *   ViewManager      -> DPR / 灏哄 / 閭忚集搴ф鑸囧楂斿儚绱犲垎闆? *   SlotMachine      -> 鐙€鎱嬫 + 鍥哄畾鏅傞枔姝ラ暦锛坒ixed timestep锛変富杩村湀
 *
 * 鈿狅笍 璩囧畨閭婄晫锛氬墠绔€屼笉瑷堢畻銆嶄腑鐛庤垏娲惧僵銆傚睍绀虹敤鐨?DemoOutcomeProvider
 *    鍙挱鏀鹃爯鍏堝濂界殑婕斿嚭鑵虫湰锛涙寮忎笂绶氳珛鎻涙垚 ServerOutcomeProvider锛? *    鐢卞緦绔敘鐢?RNG銆佹淳褰╄垏绨界珷锛屽墠绔彧璨犺铂鎶婄祼鏋滄紨鍑轰締銆? *
 * 鏈獢涓嶄娇鐢ㄤ换浣?inline script / eval / 绗笁鏂瑰嚱寮忓韩锛岀鍚?strict CSP銆? */
(function () {
  'use strict';

  // ============================================================
  // 1. 甯告暩锛氬叏閮ㄤ互銆岄倧杓儚绱?/ 绉掋€嶇偤鍠綅锛岃垏 DPR 鐒￠棞
  // ============================================================
  var CFG = {
    REELS: 5,
    ROWS: 3,
    CELL: 84,                 // 鍠牸閭忚集閭婇暦
    GAP: 10,                  // 鏍艰窛
    PAD: 14,                  // 姗熷彴鍏ч倞璺?    SYMBOL_COUNT: 8,
    MAX_V: 19,                // 鍕婚€熼殠娈碉細姣忕鎹查亷骞惧€嬬铏?    ACCEL_T: 0.55,            // 鍔犻€熻€楁檪
    MIN_SPIN_T: 1.05,         // 鏈€鐭嫽閫熸檪闁擄紙绛夊緦绔祼鏋滀篃闈犲畠鎾愪綇鐣潰锛?    STOP_STAGGER: 0.17,       // 渚濆簭鍋滄鐨勯枔闅?    STOP_T: 0.80,             // 鍠吉鍥炲綀鍋滄鑰楁檪
    FIXED_DT: 1 / 120,        // 鍥哄畾鐗╃悊姝ラ暦
    MAX_FRAME_DT: 0.05,       // 鍠箑鏈€澶?dt锛氬垏鍥炲垎闋佹檪涓嶈畵鍕曠暙鏆磋
    MAX_SUBSTEPS: 8,          // 闃叉銆屾浜¤灪鏃嬨€?    MAX_DPR: 2.5,             // Retina 涓婇檺锛?x 铻㈠箷闄嶅埌 2.5x 鎻涙晥鑳?    COINS: 200,               // 绮掑瓙姹犲閲忥紙绲曚笉鍕曟厠 new锛?    GRAVITY: 1500,            // px/s虏
    FX_DURATION: 3.6
  };

  var BOARD_W = CFG.PAD * 2 + CFG.REELS * CFG.CELL + (CFG.REELS - 1) * CFG.GAP;
  var BOARD_H = CFG.PAD * 2 + CFG.ROWS * CFG.CELL + (CFG.ROWS - 1) * CFG.GAP;
  var STEP = CFG.CELL + CFG.GAP;

  // 鍏ó绗﹁櫉锛氱敤闆㈠睆绮鹃潏鍦栭泦锛坰prite atlas锛変竴娆＄暙濂斤紝涔嬪緦鍙?drawImage
  var SYMBOLS = [
    MAX_DPR: 2,
    { label: 'BAR',  bg: '#123b2e', fg: '#e8c879', rim: '#f5efe2' },
    { label: '鈼?,    bg: '#10233f', fg: '#7fc4ff', rim: '#c9e6ff' },
    { label: '鈼?,    bg: '#2b0f14', fg: '#ff7b7b', rim: '#ffc2c2' },
    { label: '鈽?,    bg: '#3a2a06', fg: '#ffd75e', rim: '#fff0b8' },
    { label: '鈾?,    bg: '#0d2a21', fg: '#f5efe2', rim: '#9fd8c0' },
    { label: '鈾?,    bg: '#111c33', fg: '#b9a8ff', rim: '#ded6ff' },
    { label: '鈾?,    bg: '#33101a', fg: '#ff9ab0', rim: '#ffd2dd' }
  ];

  // ============================================================
  // 2. 灏忓伐鍏?  // ============================================================
  function mod(n, m) { return ((n % m) + m) % m; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // 涓夋 ease-in锛氬儚婊捐吉銆岃棣仈鎷夎捣渚嗐€嶇殑鍓嶆锛岄€熷害寰?0 骞虫粦鐖崌
  function easeInCubic(t) { return t * t * t; }

  // easeOutBack锛歝1 鎺у埗鍥炲綀骞呭害銆倀鈮?.7 鏅傛渻 > 1锛?  // 涔熷氨鏄痪杓€岃閬庡畾浣嶇窔鍐嶇洩鍥炰締銆嶁€斺€旈€欏氨鏄抄鍫存鍙伴偅鑲″崱姒劅銆?  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    var u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
  }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }

  // 寤虹珛闆㈠睆琛ㄩ潰锛涘劒鍏?OffscreenCanvas锛岃垔 Safari 閫€鍥炰竴鑸?canvas
  function makeSurface(w, h) {
    var c;
    if (typeof OffscreenCanvas !== 'undefined') {
      try { c = new OffscreenCanvas(w, h); } catch (e) { c = null; }
    }
    if (!c) { c = document.createElement('canvas'); c.width = w; c.height = h; }
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var numberFormat = new Intl.NumberFormat('en-US');

  // ============================================================
  // 3. 绲愭灉渚嗘簮锛圫erver-authoritative 閭婄晫锛?  // ============================================================

  // 灞曠ず鐢細闋愬厛瀵ソ鐨勩€屾紨鍑鸿叧鏈€嶃€傛敞鎰忛€欒！娌掓湁浠讳綍姗熺巼鎴栨淳褰╅亱绠楋紝
  // 鍓嶇鍙槸鎶婂緦绔渻绲︾殑璩囨枡绲愭鍘熸ǎ鎾嚭渚嗐€?  var DEMO_SCRIPT = [
    { requestId: 'demo-01', stops: [0, 2, 5, 3, 6], win: 0,     bigWin: false },
    { requestId: 'demo-02', stops: [1, 1, 4, 7, 2], win: 750,   bigWin: false },
    { requestId: 'demo-03', stops: [0, 0, 0, 0, 0], win: 48250, bigWin: true  },
    { requestId: 'demo-04', stops: [3, 6, 1, 4, 5], win: 0,     bigWin: false },
    { requestId: 'demo-05', stops: [4, 4, 4, 4, 4], win: 18800, bigWin: true  },
    { requestId: 'demo-06', stops: [2, 7, 0, 6, 3], win: 320,   bigWin: false }
  ];

  function DemoOutcomeProvider() { this.cursor = 0; }
  DemoOutcomeProvider.prototype.requestSpin = function (/* bet */) {
    var o = DEMO_SCRIPT[this.cursor % DEMO_SCRIPT.length];
    this.cursor += 1;
    // 妯℃摤涓€娆＄恫璺線杩旓紱鐪熷鐠板鎳夊湪鎸変笅 Spin 鐨勫悓鏅傚氨鐧煎嚭璜嬫眰
    return new Promise(function (resolve) { setTimeout(function () { resolve(o); }, 90); });
  };

  // 姝ｅ紡鐠板鐢細RNG / 娲惧僵 / 椁橀鍏ㄥ湪寰岀锛屽洖鍌冲€煎缓璀伴檮 signature 渚涘鎴剁椹楃珷
  function ServerOutcomeProvider(url) { this.url = url; }
  ServerOutcomeProvider.prototype.requestSpin = function (bet) {
    return fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ bet: bet })
    }).then(function (r) {
      if (!r.ok) { throw new Error('spin request failed: ' + r.status); }
      return r.json();
    });
  };

  // ============================================================
  // 4. 绮鹃潏鍦栭泦鑸囬噾骞ｈ布鍦栵紙渚?DPR 閲嶅缓锛岄伩鍏?Retina 妯＄硦锛?  // ============================================================
  function buildAtlas(dpr) {
    var px = Math.round(CFG.CELL * dpr);
    var surface = makeSurface(px * CFG.SYMBOL_COUNT, px);
    var c = surface.getContext('2d');
    for (var i = 0; i < CFG.SYMBOL_COUNT; i++) {
      var s = SYMBOLS[i], x = i * px;
      c.save();
      c.translate(x, 0);
      c.scale(dpr, dpr);
      c.fillStyle = s.bg;
      roundRect(c, 2, 2, CFG.CELL - 4, CFG.CELL - 4, 14);
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = s.rim;
      c.stroke();
      c.fillStyle = s.fg;
      c.font = '700 ' + (s.label.length > 1 ? 26 : 44) + 'px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(s.label, CFG.CELL / 2, CFG.CELL / 2 + 2);
      c.restore();
    }
    return { canvas: surface, px: px };
  }

  function buildCoin(dpr) {
    var size = 26, px = Math.round(size * dpr);
    var surface = makeSurface(px, px);
    var c = surface.getContext('2d');
    c.scale(dpr, dpr);
    var g = c.createRadialGradient(size * 0.35, size * 0.3, 1, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.55, '#f0c04a');
    g.addColorStop(1, '#a9741a');
    c.fillStyle = g;
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = '#7d5310';
    c.stroke();
    c.fillStyle = '#8a5c12';
    c.font = '700 13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('$', size / 2, size / 2 + 1);
    return { canvas: surface, size: size };
  }

  // ============================================================
  // 5. Reel锛氬柈杓媭鎱嬶紙accel / spin / stopping / settled锛?  // ============================================================
  function Reel(index) {
    this.index = index;
    this.offset = index * 1.37;   // 鍒濆閷綅锛岃畵浜旇吉涓嶆渻闀峰緱涓€妯′竴妯?    this.v = 0;
    this.t = 0;
    this.phase = 'settled';
    this.from = 0;
    this.distance = 0;
    this.target = 0;
    this.scheduleStop = 0;
  }
  Reel.prototype.startAccel = function () {
    this.phase = 'accel';
    this.t = 0;
    this.v = 0;
  };
  Reel.prototype.beginStop = function (stopSymbol) {
    // 涓ぎ鍒楋紙row 1锛夐’绀虹殑绗﹁櫉 = (floor(offset) + 1) % N
    // 鍙嶆帹鏈€绲傛暣鏁?offset 蹇呴爤钀藉湪 desired 閫欏€嬮鏁镐笂
    var desired = mod(stopSymbol - 1, CFG.SYMBOL_COUNT);
    var ceil = Math.ceil(this.offset);
    this.target = ceil + mod(desired - mod(ceil, CFG.SYMBOL_COUNT), CFG.SYMBOL_COUNT);
    if (this.target - this.offset < 2) { this.target += CFG.SYMBOL_COUNT; } // 鑷冲皯鍐嶆痪涓€鍦?    this.from = this.offset;
    this.distance = this.target - this.from;
    this.t = 0;
    this.phase = 'stopping';
  };
  Reel.prototype.update = function (dt, speedScale) {
    if (this.phase === 'accel') {
      this.t += dt;
      var a = clamp(this.t / (CFG.ACCEL_T * speedScale), 0, 1);
      this.v = CFG.MAX_V * easeInCubic(a);
      this.offset += this.v * dt;
      if (a >= 1) { this.phase = 'spin'; this.v = CFG.MAX_V; }
    } else if (this.phase === 'spin') {
      this.offset += this.v * dt;
    } else if (this.phase === 'stopping') {
      this.t += dt;
      var p = clamp(this.t / (CFG.STOP_T * speedScale), 0, 1);
      this.offset = this.from + this.distance * easeOutBack(p);
      if (p >= 1) { this.offset = this.target; this.phase = 'settled'; }
    }
  };
  Reel.prototype.normalize = function () {
    // 闀锋檪闁撻亱杞夊緦 offset 鏈冩寔绾岀疮鍔狅紱闈滄鏅傚彇妯″彲閬垮厤娴粸绮惧害鍔ｅ寲
    this.offset = mod(this.offset, CFG.SYMBOL_COUNT);
  };

  // ============================================================
  // 6. CoinPool锛氱墿浠舵睜锛屾覆鏌?鏇存柊杩村湀鍏т笉鐢㈢敓浠讳綍鏂扮墿浠?  // ============================================================
  function CoinPool(capacity) {
    this.items = new Array(capacity);
    for (var i = 0; i < capacity; i++) {
      this.items[i] = {
        active: false, x: 0, y: 0, vx: 0, vy: 0,
        rot: 0, vr: 0, size: 0, alpha: 1, spin: 0
      };
    }
    this.capacity = capacity;
    this.cursor = 0;
  }
  CoinPool.prototype.emit = function (n, w, h, reduced) {
    var count = reduced ? Math.min(n, 24) : n;
    for (var k = 0; k < count; k++) {
      var p = null, tries = 0;
      while (tries < this.capacity) {
        var cand = this.items[this.cursor];
        this.cursor = (this.cursor + 1) % this.capacity;
        tries += 1;
        if (!cand.active) { p = cand; break; }
      }
      if (!p) { return; } // 姹犲凡婊匡細鐩存帴鏀炬锛岀禃涓?new
      // 鐢辫灑骞曚笅鏂逛腑澶線澶栧櫞锛涜搴﹁惤鍦ㄤ笂鍗婂湏锛屽舰鎴愭媼鐗╃窔
      var ang = (0.18 + Math.random() * 0.64) * Math.PI;
      var speed = 620 + Math.random() * 620;
      p.active = true;
      p.x = w * 0.5 + (Math.random() - 0.5) * w * 0.35;
      p.y = h + 12 + Math.random() * 30;
      p.vx = Math.cos(ang) * speed * (Math.random() < 0.5 ? -1 : 1);
      p.vy = -Math.sin(ang) * speed;
      p.rot = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 12;
      p.size = 16 + Math.random() * 14;
      p.alpha = 1;
      p.spin = 0.55 + Math.random() * 0.45;
    }
  };
  CoinPool.prototype.update = function (dt, w, h) {
    for (var i = 0; i < this.capacity; i++) {
      var p = this.items[i];
      if (!p.active) { continue; }
      p.vy += CFG.GRAVITY * dt;         // 閲嶅姏 鈫?鎷嬬墿绶?      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.vy > 0) { p.alpha = clamp(1 - (p.y - h * 0.72) / (h * 0.42), 0, 1); }
      // 閭婄晫鐢ㄥ闅涜绐楀 w锛涜垔瀵硶瑾ょ敤 h*3 鏈冭畵瀵灑骞曠殑绮掑瓙鏅氬洖鏀?      if (p.y > h + 60 || p.x < -80 || p.x > w + 80) { p.active = false; }
    }
  };
  CoinPool.prototype.clear = function () {
    for (var i = 0; i < this.capacity; i++) { this.items[i].active = false; }
  };

  // ============================================================
  // 7. 闊虫晥锛欰udioContext 蹇呴爤鐢变娇鐢ㄨ€呮墜鍕㈣В閹栵紝寤堕伈鎵嶄綆
  // ============================================================
  var Sound = (function () {
    var ac = null, enabled = true;
    function unlock() {
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { return; }
        ac = new AC();
      }
      if (ac.state === 'suspended') { ac.resume(); }
    }
    function tone(freq, delay, dur, vol) {
      if (!ac || !enabled) { return; }
      var t = ac.currentTime + delay;
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.connect(gain);
      gain.connect(ac.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    }
    return {
      unlock: unlock,
      spin: function () { tone(320, 0, 0.10, 0.05); },
      stop: function (i) { tone(520 + i * 90, 0, 0.09, 0.045); },
      bigWin: function () {
        [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.09, 0.34, 0.055); });
      },
      setEnabled: function (v) { enabled = v; if (v) { unlock(); } },
      isEnabled: function () { return enabled; }
    };
  }());

  // ============================================================
  // 8. BigWinFX锛氬叏铻㈠箷鏆楀寲 + 閲戝梗 + 鏁稿瓧 tween
  // ============================================================
  function BigWinFX(canvas, onDone) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onDone = onDone;
    this.active = false;
    this.t = 0;
    this.amount = 0;
    this.wave = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.pool = new CoinPool(CFG.COINS);
    this.coin = null;
    this.reduced = false;
  }
  BigWinFX.prototype.resize = function (w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    var pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw; this.canvas.height = ph;
    }
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.coin = buildCoin(dpr);   // 璨煎湒闅?DPR 閲嶅缓
  };
  BigWinFX.prototype.start = function (amount, reduced) {
    this.active = true;
    this.t = 0;
    this.wave = 0;
    this.amount = amount;
    this.reduced = reduced;
    this.pool.clear();
    this.canvas.setAttribute('aria-hidden', 'false');
    Sound.bigWin();
  };
  // 鏂颁竴灞€闁嬪鏅傚畬鏁存敹鎺変笂涓€鍫寸壒鏁堬紝閬垮厤 aria-hidden 鑸囩矑瀛愮媭鎱嬫畼鐣?  BigWinFX.prototype.cancel = function () {
    this.active = false;
    this.t = 0;
    this.wave = 0;
    this.pool.clear();
    this.canvas.setAttribute('aria-hidden', 'true');
  };
  BigWinFX.prototype.update = function (dt) {
    if (!this.active) { return; }
    this.t += dt;
    // 涓夋尝鍣寸櫦锛岀敤鏅傞枔榛炲垽鏂疯€岄潪 setTimeout锛岄伩鍏嶈▓鏅傚櫒鑸囨毇鍋滀笉鍚屾
    var waveTimes = [0.05, 0.42, 0.85];
    while (this.wave < waveTimes.length && this.t >= waveTimes[this.wave]) {
      this.pool.emit(this.reduced ? 20 : 70, this.w, this.h, this.reduced);
      this.wave += 1;
    }
    this.pool.update(dt, this.w, this.h);
    if (this.t >= CFG.FX_DURATION) {
      this.active = false;
      this.pool.clear();
      this.canvas.setAttribute('aria-hidden', 'true');
      if (this.onDone) { this.onDone(); }
    }
  };
  BigWinFX.prototype.render = function () {
    var c = this.ctx;
    // 姣忓箑閲嶈ō transform锛屽洜鐐洪噾骞ｇ躬瑁芥渻鏀瑰瀹?    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    if (!this.active) { return; }

    var fadeIn = clamp(this.t / 0.28, 0, 1);
    var fadeOut = clamp((CFG.FX_DURATION - this.t) / 0.55, 0, 1);
    var alpha = Math.min(fadeIn, fadeOut);

    // (a) 鑳屾櫙鏆楀寲
    c.fillStyle = 'rgba(3, 10, 8, ' + (0.80 * alpha).toFixed(3) + ')';
    c.fillRect(0, 0, this.w, this.h);

    // (b) 閲戝梗锛氱敤 setTransform 鐩存帴鍋氭棆杞夛紝鐪佹帀 200 娆?save/restore
    var sprite = this.coin.canvas, items = this.pool.items;
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      if (!p.active) { continue; }
      var cos = Math.cos(p.rot) * this.dpr, sin = Math.sin(p.rot) * this.dpr;
      c.globalAlpha = p.alpha * alpha;
      c.setTransform(cos, sin, -sin, cos, p.x * this.dpr, p.y * this.dpr);
      c.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // (c) 妯欓 + 鍕曟厠閬炲鏁稿瓧
    var pop = easeOutBack(clamp(this.t / 0.55, 0, 1));
    var cx = this.w / 2, cy = this.h * 0.38;
    c.save();
    c.translate(cx, cy);
    c.scale(pop, pop);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = alpha;
    c.shadowColor = 'rgba(232, 200, 121, 0.85)';
    c.shadowBlur = 26;
    c.fillStyle = '#f5efe2';
    c.font = '800 ' + Math.min(56, this.w * 0.11) + 'px system-ui, sans-serif';
    c.fillText('BIG WIN', 0, -46);
    c.restore();

    // 鏁稿瓧 tween锛歟aseOutCubic 璁撳墠闈㈣蹇€佸熬绔參鎱㈣鍒板畾浣?    var numP = easeOutCubic(clamp(this.t / 1.7, 0, 1));
    var shown = Math.round(this.amount * numP);
    c.save();
    c.globalAlpha = alpha;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(240, 192, 74, 0.9)';
    c.shadowBlur = 30;
    c.fillStyle = '#f0c04a';
    c.font = '800 ' + Math.min(74, this.w * 0.14) + 'px system-ui, sans-serif';
    c.fillText(numberFormat.format(shown), cx, cy + 42);
    c.restore();
    c.shadowBlur = 0;
    c.globalAlpha = 1;
  };

  // ============================================================
  // 9. SlotMachine锛氱媭鎱嬫 + DPR + 鍥哄畾鏅傞枔姝ラ暦
  // ============================================================
  var STATE = {
    IDLE: 'IDLE',
    SPINNING: 'SPINNING',
    STOPPING: 'STOPPING',
    SETTLE: 'SETTLE',
    WIN_PRESENTATION: 'WIN_PRESENTATION'
  };

  function SlotMachine(opts) {
    this.reelCanvas = opts.reelCanvas;
    this.fxCanvas = opts.fxCanvas;
    this.statusEl = opts.statusEl;
    this.winEl = opts.winEl;
    this.spinBtn = opts.spinBtn;
    this.muteBtn = opts.muteBtn;
    this.container = opts.container;

    this.ctx = this.reelCanvas.getContext('2d');
    this.reels = [];
    for (var i = 0; i < CFG.REELS; i++) { this.reels.push(new Reel(i)); }

    // 灞曠ず鐢紱姝ｅ紡鐠板鏀规垚 new ServerOutcomeProvider('/api/spin')
    this.provider = new DemoOutcomeProvider();

    this.state = STATE.IDLE;
    this.elapsed = 0;
    this.outcome = null;
    this.atlas = null;
    this.dpr = 1;
    this.scale = 1;
    this.cssW = 0;
    this.cssH = 0;
    this.reduced = false;
    this.reelVisible = true;

    this.lastTime = 0;
    this.accumulator = 0;
    this.rafId = 0;
    this.running = false;
    this.destroyed = false;

    this.fx = new BigWinFX(this.fxCanvas, this.onPresentationDone.bind(this));

    this.bindEvents();
    this.readMotionPreference();
    this.resize();
    this.setStatus('Ready. Press Spin to start.');
    this.start();
  }

  SlotMachine.prototype.readMotionPreference = function () {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = mq.matches;
    var self = this;
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) { self.reduced = e.matches; });
    }
    // 娓涘皯鍕曟厠鏅傛妸婕斿嚭鏅傞枔澹撶煭锛屼絾淇濈暀瀹屾暣鐙€鎱嬫祦绋?    this.speedScale = this.reduced ? 0.45 : 1;
  };

  // ---- DPR 閬╅厤 -------------------------------------------------
  SlotMachine.prototype.resize = function () {
    // (1) DPR 涓婇檺锛歩Phone 鐨?3x 鍏ㄨВ鏋愬害鏈冭畵 backing store 璁婃垚 9 鍊嶅儚绱狅紝
    //     濉豢鐜囷紙fill rate锛夌洿鎺ュ悆鎺夊箑鐜囷紝鏁呴墬鍒跺湪 2.5x銆?    var dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    var available = this.container.clientWidth || 600;
    var cssW = Math.min(available, 620);
    var scale = cssW / BOARD_W;
    var cssH = BOARD_H * scale;

    // (2) 閭忚集搴ф 鈫?瀵﹂珨鍍忕礌锛氬彧鏈?backing store 鐢?dpr锛岀躬鍦栦粛鐒剁敤閭忚集鍠綅
    var pw = Math.max(1, Math.round(cssW * dpr)), ph = Math.max(1, Math.round(cssH * dpr));
    if (this.reelCanvas.width !== pw || this.reelCanvas.height !== ph) {
      this.reelCanvas.width = pw; this.reelCanvas.height = ph;
    }
    this.reelCanvas.style.width = cssW + 'px';
    this.reelCanvas.style.height = cssH + 'px';

    this.dpr = dpr; this.scale = scale; this.cssW = cssW; this.cssH = cssH;
    if (!this.atlas || this.atlasDpr !== dpr) {
      this.atlas = buildAtlas(dpr);
      this.atlasDpr = dpr;
    }
    this.fx.resize(window.innerWidth, window.innerHeight, dpr);
  };

  SlotMachine.prototype.watchDpr = function () {
    // 鎶婅绐楁嫋鍒颁笉鍚?DPI 鐨勮灑骞曟檪 devicePixelRatio 鏈冭畩锛岀敤 matchMedia 鐩ｈ伣
    var self = this;
    if (this.dprQuery && this.dprQuery.removeEventListener) {
      this.dprQuery.removeEventListener('change', this.dprHandler);
    }
    this.dprQuery = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
    this.dprHandler = function () { self.resize(); self.watchDpr(); };
    if (this.dprQuery.addEventListener) {
      this.dprQuery.addEventListener('change', this.dprHandler);
    }
  };

  // ---- 浜嬩欢缍佸畾 -------------------------------------------------
  SlotMachine.prototype.bindEvents = function () {
    var self = this;

    this.spinBtn.addEventListener('click', function () {
      Sound.unlock();
      self.spin();
    });
    this.muteBtn.addEventListener('click', function () {
      var next = !Sound.isEnabled();
      Sound.setEnabled(next);
      self.muteBtn.setAttribute('aria-pressed', String(!next));
      self.muteBtn.textContent = next ? 'Sound on' : 'Sound off';
    });

    // 閸电洡蹇嵎閸碉細鍙湪鐒﹂粸浣嶆柤绀虹瘎鍗€鍏ф墠鏀旀埅锛岄伩鍏嶅共鎿炬暣闋佹嵅鍕?    this.container.addEventListener('keydown', function (e) {
      if (e.key === 's' || e.key === 'S') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { return; }
        e.preventDefault();
        Sound.unlock();
        self.spin();
      }
    });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { self.resize(); self.watchDpr(); }, 120);
    });
    this.watchDpr();

    // 鍒嗛爜鍒囧洖渚嗘檪閲嶈ō鏅傞枔鍩烘簴锛岄€欐槸銆屽嫊鐣毚琛濄€嶇殑鏍瑰洜淇京
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { self.pause(); } else { self.resume(); }
    });
    window.addEventListener('pagehide', function () { self.pause(); });
    window.addEventListener('pageshow', function () { self.resume(); });

    // 婊惧嚭瑕栭噹灏辩暐閬庢鍙扮躬瑁斤紙鐙€鎱嬬収璺戯級锛岀渷闆?    if (typeof IntersectionObserver !== 'undefined') {
      var io = new IntersectionObserver(function (entries) {
        self.reelVisible = entries[0].isIntersecting;
      }, { threshold: 0.01 });
      io.observe(this.reelCanvas);
    }
  };

  SlotMachine.prototype.pause = function () {
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }
    this.lastTime = 0;        // 闂滈嵉锛氫笉璁撶疮绌嶇殑鐗嗛悩鏅傞枔鐏岄€蹭笅涓€骞€
    this.accumulator = 0;
  };
  SlotMachine.prototype.resume = function () {
    if (this.destroyed || this.running) { return; }
    this.lastTime = 0;
    this.accumulator = 0;
    this.start();
  };
  SlotMachine.prototype.start = function () {
    if (this.running) { return; }
    this.running = true;
    var self = this;
    this.rafId = requestAnimationFrame(function (t) { self.frame(t); });
  };

  // ---- 涓昏看鍦堬細鍥哄畾鏅傞枔姝ラ暦 + 鍠箑 dt 閴楀埗 ----------------------
  SlotMachine.prototype.frame = function (now) {
    if (!this.running) { return; }
    if (this.lastTime === 0) { this.lastTime = now; }
    var dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // 鍒囧洖鍒嗛爜 / 闀锋檪闁?GC 寰?dt 鍙兘鏄暩绉掞紱閴楀埗寰岀墿鐞嗕笉鏈冧竴娆¤烦瀹?    if (dt > CFG.MAX_FRAME_DT) { dt = CFG.MAX_FRAME_DT; }
    if (dt < 0) { dt = 0; }

    this.accumulator += dt;
    var steps = 0;
    while (this.accumulator >= CFG.FIXED_DT && steps < CFG.MAX_SUBSTEPS) {
      this.update(CFG.FIXED_DT);
      this.accumulator -= CFG.FIXED_DT;
      steps += 1;
    }
    if (steps === CFG.MAX_SUBSTEPS) { this.accumulator = 0; } // 閬垮厤姝讳骸铻烘棆

    this.render();
    var self = this;
    this.rafId = requestAnimationFrame(function (t) { self.frame(t); });
  };

  // ---- 鐙€鎱嬫 ---------------------------------------------------
  SlotMachine.prototype.setStatus = function (text) {
    if (this.statusEl) { this.statusEl.textContent = text; }
  };

  SlotMachine.prototype.spin = function () {
    if (this.state !== STATE.IDLE) { return; }
    this.state = STATE.SPINNING;
    this.elapsed = 0;
    this.outcome = null;
    this.fx.cancel();
    for (var i = 0; i < this.reels.length; i++) { this.reels[i].startAccel(); }
    this.spinBtn.disabled = true;
    this.setStatus('Reels accelerating鈥?);
    if (this.winEl) { this.winEl.textContent = '0'; }
    Sound.spin();

    var self = this;
    // 绲愭灉璜嬫眰鑸囪瑕烘紨鍑轰甫琛岋細寰岀鎱篃涓嶆渻璁撹綁杓厛鍋滀笅渚?    this.provider.requestSpin(1).then(function (o) {
      self.outcome = o;
    }).catch(function () {
      // 璜嬫眰澶辨晽鏅備笉涓崕锛岀禃涓嶅湪鍓嶇銆岃嚜宸辫涓€鍊嬬祼鏋溿€?      self.outcome = { requestId: 'error', stops: [0, 0, 0, 0, 0], win: 0, bigWin: false };
      self.setStatus('Result request failed; no payout this round.');
    });
  };

  SlotMachine.prototype.update = function (dt) {
    var i, r;
    this.elapsed += dt;

    for (i = 0; i < this.reels.length; i++) {
      this.reels[i].update(dt, this.speedScale);
    }
    this.fx.update(dt);

    if (this.state === STATE.SPINNING) {
      var ready = this.elapsed >= (CFG.ACCEL_T + CFG.MIN_SPIN_T) * this.speedScale;
      if (ready && this.outcome) {
        this.state = STATE.STOPPING;
        this.setStatus('Stopping reels left to right鈥?);
        for (i = 0; i < this.reels.length; i++) {
          this.reels[i].scheduleStop = this.elapsed + i * CFG.STOP_STAGGER * this.speedScale;
        }
      }
    } else if (this.state === STATE.STOPPING) {
      for (i = 0; i < this.reels.length; i++) {
        r = this.reels[i];
        if (r.phase === 'spin' && this.elapsed >= r.scheduleStop) {
          r.beginStop(this.outcome.stops[i]);
          Sound.stop(i);
        }
      }
      var allSettled = true;
      for (i = 0; i < this.reels.length; i++) {
        if (this.reels[i].phase !== 'settled') { allSettled = false; break; }
      }
      if (allSettled) {
        this.state = STATE.SETTLE;
        this.settle();
      }
    }
  };

  SlotMachine.prototype.settle = function () {
    for (var i = 0; i < this.reels.length; i++) { this.reels[i].normalize(); }
    var o = this.outcome;
    if (o.win > 0) { this.winEl.textContent = numberFormat.format(o.win); }

    if (o.bigWin) {
      // 鍙湁澶х崕鎵嶆挱鍏ㄨ灑骞曟叾绁濓紱灏忛涓崕鍙洿鏂版暩瀛楋紝閬垮厤銆屾瘡娆￠兘鏀惧ぇ鎷涖€嶇殑鐤蹭箯鎰?      this.state = STATE.WIN_PRESENTATION;
      this.setStatus('Big Win! Celebration playing.');
      this.fx.start(o.win, this.reduced);
    } else {
      this.state = STATE.IDLE;
      this.spinBtn.disabled = false;
      this.setStatus(o.win > 0 ? 'Small win credited. Press Spin again.' : 'No win. Press Spin again.');
    }
  };

  SlotMachine.prototype.onPresentationDone = function () {
    this.state = STATE.IDLE;
    this.spinBtn.disabled = false;
    this.setStatus('Presentation finished. Press Spin again.');
  };

  // ---- 绻＝ -----------------------------------------------------
  SlotMachine.prototype.render = function () {
    // FX 姘搁仩瑕佺暙锛堝嵆浣挎鍙版痪鍑鸿閲庯級
    this.fx.render();
    if (!this.reelVisible || !this.atlas) { return; }

    var c = this.ctx;
    var m = this.dpr * this.scale;
    // 姣忓箑閲嶈ō transform锛坈anvas.width 璁婂嫊鎴?FX 鍏辩敤鏅傛墠涓嶆渻娈樼暀锛?    c.setTransform(m, 0, 0, m, 0, 0);
    c.clearRect(0, 0, BOARD_W, BOARD_H);

    // 姗熷彴澶栨
    c.fillStyle = '#07120f';
    roundRect(c, 0, 0, BOARD_W, BOARD_H, 18);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#e8c879';
    c.stroke();

    var atlas = this.atlas;
    for (var i = 0; i < CFG.REELS; i++) {
      var r = this.reels[i];
      var x = CFG.PAD + i * STEP;

      c.save();
      c.beginPath();
      c.rect(x, CFG.PAD, CFG.CELL, CFG.ROWS * STEP - CFG.GAP);
      c.clip();

      // 姣忚吉搴曡壊
      c.fillStyle = '#0d2a21';
      c.fillRect(x, CFG.PAD, CFG.CELL, CFG.ROWS * STEP - CFG.GAP);

      var base = Math.floor(r.offset);
      var frac = r.offset - base;
      // 澶氱暙涓婁笅鍚勪竴鏍硷紝鎹插嫊鏅傛墠涓嶆渻闇插嚭绌虹櫧
      for (var j = -1; j <= CFG.ROWS; j++) {
        var idx = mod(base + j, CFG.SYMBOL_COUNT);
        var y = CFG.PAD + j * STEP - frac * STEP;
        c.drawImage(
          atlas.canvas,
          idx * atlas.px, 0, atlas.px, atlas.px,
          x, y, CFG.CELL, CFG.CELL
        );
      }

      // 楂橀€熸檪鍔犱竴灞ゆ贰闇э紝鐕熼€犻€熷害鎰燂紙鎴愭湰妤典綆锛?      if (r.phase === 'spin' || r.phase === 'accel') {
        c.fillStyle = 'rgba(245, 239, 226, 0.06)';
        c.fillRect(x, CFG.PAD, CFG.CELL, 3);
        c.fillRect(x, CFG.PAD + STEP, CFG.CELL, 3);
        c.fillRect(x, CFG.PAD + STEP * 2, CFG.CELL, 3);
      }
      c.restore();

      // 杓
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(232, 200, 121, 0.35)';
      c.strokeRect(x + 0.5, CFG.PAD + 0.5, CFG.CELL - 1, CFG.ROWS * STEP - CFG.GAP - 1);
    }

    // 涓ぎ娲惧僵绶?    var lineY = CFG.PAD + STEP + CFG.CELL / 2;
    c.strokeStyle = 'rgba(240, 192, 74, 0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(CFG.PAD - 6, lineY);
    c.lineTo(BOARD_W - CFG.PAD + 6, lineY);
    c.stroke();

    if (this.reduced) {
      // 娓涘皯鍕曟厠鏅傜郸涓€鍊嬫槑纰虹殑闈滄厠鎻愮ず锛岃€屼笉鏄畬鍏ㄦ矑鏈夊洖楗?      c.fillStyle = 'rgba(245, 239, 226, 0.75)';
      c.font = '600 12px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText('REDUCED MOTION', CFG.PAD, BOARD_H - 4);
    }
  };

  // ============================================================
  // 10. 鍟熷嫊
  // ============================================================
  function boot() {
    var reelCanvas = document.getElementById('slot-canvas');
    if (!reelCanvas) { return; }
    var machine = new SlotMachine({
      reelCanvas: reelCanvas,
      fxCanvas: document.getElementById('fx-canvas'),
      container: document.getElementById('slot-demo'),
      statusEl: document.getElementById('slot-status'),
      winEl: document.getElementById('slot-win'),
      spinBtn: document.getElementById('spin-btn'),
      muteBtn: document.getElementById('mute-btn')
    });
    window.__neonAceSlots = machine; // 鏂逛究涓绘帶鍙版瑕栫媭鎱嬫锛堟寮忕挵澧冨彲绉婚櫎锛?  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}());
