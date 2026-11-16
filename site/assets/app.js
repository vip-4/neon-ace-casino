/*
 * Neon Ace — free browser blackjack
 * Vanilla JavaScript. No dependencies, no network calls, no tracking.
 *
 * Architecture: a small deterministic game state, a render layer that redraws
 * the table from that state, and async dealer animation guarded by a round
 * token so a reset or a new hand cannot collide with an in-flight animation.
 */
(() => {
  'use strict';

  const CONFIG = Object.freeze({
    DECKS: 6,
    TOTAL_CARDS: 312,
    STARTING_BANKROLL: 1000,
    MIN_BET: 10,
    BLACKJACK_PAYS: 1.5,
    MAX_HANDS: 4,
    RESHUFFLE_AT: 78
  });

  const STORAGE_KEY = 'neonace.v1';
  const ALLOWED_BETS = [10, 25, 50, 100];

  const SUITS = Object.freeze([
    { name: 'spades', symbol: '♠', red: false },
    { name: 'hearts', symbol: '♥', red: true },
    { name: 'diamonds', symbol: '♦', red: true },
    { name: 'clubs', symbol: '♣', red: false }
  ]);

  const RANKS = Object.freeze([
    { key: 'A', name: 'Ace', value: 11 },
    { key: '2', name: 'Two', value: 2 },
    { key: '3', name: 'Three', value: 3 },
    { key: '4', name: 'Four', value: 4 },
    { key: '5', name: 'Five', value: 5 },
    { key: '6', name: 'Six', value: 6 },
    { key: '7', name: 'Seven', value: 7 },
    { key: '8', name: 'Eight', value: 8 },
    { key: '9', name: 'Nine', value: 9 },
    { key: '10', name: 'Ten', value: 10 },
    { key: 'J', name: 'Jack', value: 10 },
    { key: 'Q', name: 'Queen', value: 10 },
    { key: 'K', name: 'King', value: 10 }
  ]);

  const SOUNDS = Object.freeze({
    deal: [[520, 0.055, 0, 'triangle']],
    chip: [[680, 0.045, 0, 'square']],
    flip: [[300, 0.075, 0, 'triangle']],
    win: [[523.25, 0.09, 0], [659.25, 0.09, 0.08], [783.99, 0.16, 0.16]],
    lose: [[220, 0.12, 0], [164.81, 0.18, 0.12]],
    push: [[349.23, 0.08, 0], [392, 0.11, 0.09]]
  });

  const els = {
    game: document.getElementById('game'),
    dealerCards: document.getElementById('dealer-cards'),
    dealerScore: document.getElementById('dealer-score'),
    playerHands: document.getElementById('player-hands'),
    message: document.getElementById('table-message'),
    bankroll: document.getElementById('bankroll'),
    shoeProgress: document.getElementById('shoe-progress'),
    shoeValue: document.getElementById('shoe-value'),
    betPicker: document.getElementById('bet-picker'),
    betInputs: Array.from(document.querySelectorAll('input[name="bet"]')),
    deal: document.getElementById('btn-deal'),
    dealLabel: document.getElementById('deal-label'),
    actionBar: document.getElementById('action-bar'),
    hit: document.getElementById('btn-hit'),
    stand: document.getElementById('btn-stand'),
    double: document.getElementById('btn-double'),
    split: document.getElementById('btn-split'),
    statHands: document.getElementById('stat-hands'),
    statWinrate: document.getElementById('stat-winrate'),
    statBlackjacks: document.getElementById('stat-blackjacks'),
    statBest: document.getElementById('stat-best'),
    sound: document.getElementById('btn-sound'),
    soundLabel: document.getElementById('sound-label'),
    reset: document.getElementById('btn-reset'),
    resetDialog: document.getElementById('reset-dialog'),
    tableHint: document.getElementById('table-hint')
  };

  const state = {
    bankroll: CONFIG.STARTING_BANKROLL,
    bet: 25,
    shoe: [],
    dealer: { cards: [], holeHidden: true },
    hands: [],
    activeHand: 0,
    phase: 'betting',
    busy: false,
    settled: false,
    roundStart: CONFIG.STARTING_BANKROLL,
    roundNet: 0,
    sound: false,
    stats: {
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      best: CONFIG.STARTING_BANKROLL
    }
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const chipFormat = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  let audioContext = null;
  let roundToken = 0;

  /* Utilities ------------------------------------------------------------- */

  function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function formatChips(value) {
    return chipFormat.format(round2(value));
  }

  function delay(ms) {
    const wait = reduceMotion.matches ? Math.min(ms, 40) : ms;
    return new Promise((resolve) => window.setTimeout(resolve, wait));
  }

  function secureRandomInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    const cryptoObject = window.crypto || window.msCrypto;
    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
      const range = 0x100000000;
      const limit = range - (range % maxExclusive);
      const buffer = new Uint32Array(1);
      let randomValue = 0;
      do {
        cryptoObject.getRandomValues(buffer);
        randomValue = buffer[0];
      } while (randomValue >= limit);
      return randomValue % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffleInPlace(cards) {
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = secureRandomInt(index + 1);
      const temporary = cards[index];
      cards[index] = cards[swapIndex];
      cards[swapIndex] = temporary;
    }
    return cards;
  }

  function newShoe() {
    const cards = [];
    for (let deck = 0; deck < CONFIG.DECKS; deck += 1) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          cards.push({ rank, suit });
        }
      }
    }
    return shuffleInPlace(cards);
  }

  function drawCard() {
    if (state.shoe.length === 0) state.shoe = newShoe();
    return state.shoe.pop();
  }

  function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
      total += card.rank.value;
      if (card.rank.key === 'A') aces += 1;
    }
    let softAces = aces;
    while (total > 21 && softAces > 0) {
      total -= 10;
      softAces -= 1;
    }
    return { total, soft: softAces > 0 };
  }

  function isNatural(cards) {
    return cards.length === 2 && handValue(cards).total === 21;
  }

  function isNaturalHand(hand) {
    return !hand.isSplit && isNatural(hand.cards);
  }

  function scoreText(cards) {
    const value = handValue(cards);
    if (value.soft && value.total !== 21) return `Soft ${value.total}`;
    return String(value.total);
  }

  function handName(index) {
    return state.hands.length > 1 ? `Hand ${index + 1}` : 'Your hand';
  }

  function createHand(bet) {
    return {
      cards: [],
      bet: round2(bet),
      doubled: false,
      done: false,
      busted: false,
      isSplit: false,
      noResplit: false,
      result: null
    };
  }

  /* Storage --------------------------------------------------------------- */

  function loadSaved() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      if (Number.isFinite(data.bankroll) && data.bankroll >= 0) {
        state.bankroll = round2(data.bankroll);
      }

      if (Number.isFinite(data.bet) && ALLOWED_BETS.includes(Number(data.bet))) {
        state.bet = Number(data.bet);
      }

      if (typeof data.sound === 'boolean') {
        state.sound = data.sound;
      }

      if (data.stats && typeof data.stats === 'object') {
        const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
        state.stats = {
          hands: count(data.stats.hands),
          wins: count(data.stats.wins),
          losses: count(data.stats.losses),
          pushes: count(data.stats.pushes),
          blackjacks: count(data.stats.blackjacks),
          best: Math.max(
            CONFIG.STARTING_BANKROLL,
            Number.isFinite(data.stats.best) ? round2(data.stats.best) : 0,
            state.bankroll
          )
        };
      }
    } catch (error) {
      /* Storage can be blocked in private modes. The game still works. */
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        bankroll: state.bankroll,
        bet: state.bet,
        sound: state.sound,
        stats: state.stats
      }));
    } catch (error) {
      /* A blocked storage API must never break the table. */
    }
  }

  /* Feedback -------------------------------------------------------------- */

  function setMessage(text, tone = '') {
    els.message.textContent = text;
    els.message.classList.remove('is-win', 'is-loss', 'is-push');
    if (tone) els.message.classList.add(`is-${tone}`);
  }

  function playSound(name) {
    if (!state.sound) return;
    const sequence = SOUNDS[name];
    if (!sequence) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) audioContext = new AudioContextClass();
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      const start = audioContext.currentTime + 0.012;
      for (const [frequency, duration, offset = 0, type = 'sine'] of sequence) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.045, start + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + duration + 0.02);
      }
    } catch (error) {
      /* Audio is an enhancement; failure is silent by design. */
    }
  }

  function syncSound() {
    els.sound.setAttribute('aria-pressed', String(state.sound));
    els.soundLabel.textContent = state.sound ? 'Sound on' : 'Sound off';
    els.sound.title = state.sound ? 'Mute game sounds' : 'Enable game sounds';
  }

  function focusPrimary() {
    window.requestAnimationFrame(() => {
      if (!document.hasFocus()) return;
      if (state.phase === 'player' && !els.hit.disabled) {
        els.hit.focus({ preventScroll: true });
        return;
      }
      if (!els.deal.hidden && !els.deal.disabled) {
        els.deal.focus({ preventScroll: true });
        return;
      }
      if (state.bankroll < CONFIG.MIN_BET) {
        els.reset.focus({ preventScroll: true });
      }
    });
  }

  /* Rendering ------------------------------------------------------------- */

  function createCardElement(card, faceDown = false) {
    const element = document.createElement('div');

    if (faceDown) {
      element.className = 'card card--back';
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', 'Face-down card');
      element.title = 'Face-down card';
      return element;
    }

    const rankKey = card.rank.key;
    const isCourt = rankKey === 'J' || rankKey === 'Q' || rankKey === 'K';
    const isAce = rankKey === 'A';
    element.className = [
      'card',
      card.suit.red ? 'card--red' : 'card--black',
      isCourt ? 'card--court' : '',
      isAce ? 'card--ace' : ''
    ].filter(Boolean).join(' ');
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', `${card.rank.name} of ${card.suit.name}`);
    element.title = `${card.rank.name} of ${card.suit.name}`;

    const corner = (bottom) => {
      const wrapper = document.createElement('span');
      wrapper.className = bottom ? 'card__corner card__corner--br' : 'card__corner';
      wrapper.setAttribute('aria-hidden', 'true');
      const rank = document.createElement('span');
      rank.className = 'card__rank';
      rank.textContent = rankKey;
      const suit = document.createElement('span');
      suit.className = 'card__suit-sm';
      suit.textContent = card.suit.symbol;
      wrapper.append(rank, suit);
      return wrapper;
    };

    element.append(corner(false));

    if (isCourt) {
      const court = document.createElement('span');
      court.className = 'card__court';
      court.setAttribute('aria-hidden', 'true');
      const courtRank = document.createElement('span');
      courtRank.className = 'card__court-rank';
      courtRank.textContent = rankKey;
      const courtSuit = document.createElement('span');
      courtSuit.className = 'card__court-suit';
      courtSuit.textContent = card.suit.symbol;
      court.append(courtRank, courtSuit);
      element.append(court);
    } else {
      const pip = document.createElement('span');
      pip.className = 'card__suit-lg';
      pip.setAttribute('aria-hidden', 'true');
      pip.textContent = card.suit.symbol;
      element.append(pip);
    }

    element.append(corner(true));
    return element;
  }

  function ghostCard() {
    const element = document.createElement('div');
    element.className = 'card card--ghost';
    element.setAttribute('aria-hidden', 'true');
    return element;
  }

  function appendGhosts(container, count = 2) {
    for (let index = 0; index < count; index += 1) {
      container.append(ghostCard());
    }
  }

  function renderCards(container, cards, hideLast = false) {
    container.replaceChildren();
    container.classList.toggle('cards--dense', cards.length > 4);

    const hasHiddenCard = hideLast && cards.length > 0;
    const faceUpCards = hasHiddenCard ? cards.slice(0, -1) : cards;
    for (const card of faceUpCards) {
      container.append(createCardElement(card));
    }
    if (hasHiddenCard) {
      container.append(createCardElement(cards[cards.length - 1], true));
    }
  }

  function renderDealer() {
    const cards = state.dealer.cards;

    if (cards.length === 0) {
      els.dealerCards.replaceChildren();
      appendGhosts(els.dealerCards, 2);
      els.dealerScore.textContent = '—';
      els.dealerScore.className = 'score-pill';
      els.dealerScore.setAttribute('aria-label', 'Dealer score, no cards dealt');
      els.dealerCards.setAttribute('aria-label', "Dealer's cards, waiting for a deal");
      return;
    }

    const hidden = state.dealer.holeHidden && cards.length > 1;
    renderCards(els.dealerCards, cards, hidden);
    els.dealerCards.setAttribute('aria-label', hidden ? "Dealer's cards, one face down" : "Dealer's cards");

    if (hidden) {
      const upcard = handValue(cards.slice(0, 1));
      els.dealerScore.textContent = `${upcard.total} + ?`;
      els.dealerScore.className = 'score-pill';
      els.dealerScore.setAttribute('aria-label', `Dealer shows ${scoreText(cards.slice(0, 1))}, hole card face down`);
      els.dealerScore.title = 'The dealer’s hole card is face down';
      return;
    }

    const value = handValue(cards);
    els.dealerScore.textContent = scoreText(cards);
    els.dealerScore.className = 'score-pill';
    if (value.total > 21) {
      els.dealerScore.classList.add('is-bust');
      els.dealerScore.setAttribute('aria-label', `Dealer score ${value.total}, bust`);
      els.dealerScore.title = 'Dealer busts';
    } else {
      if (value.soft) els.dealerScore.classList.add('is-soft');
      els.dealerScore.setAttribute('aria-label', `Dealer score ${scoreText(cards)}`);
      els.dealerScore.title = value.soft ? `Dealer has a soft ${value.total}` : `Dealer has ${value.total}`;
    }
  }

  function resultLabel(result) {
    return {
      blackjack: 'Blackjack',
      win: 'Win',
      push: 'Push',
      bust: 'Bust',
      lose: 'Loss'
    }[result] || '';
  }

  function renderHands() {
    els.playerHands.replaceChildren();

    if (state.hands.length === 0) {
      const empty = document.createElement('article');
      empty.className = 'hand hand--empty';
      empty.setAttribute('aria-label', 'Your hand, waiting for a deal');

      const head = document.createElement('div');
      head.className = 'hand-head';
      const label = document.createElement('span');
      label.className = 'hand-label';
      label.textContent = 'Your hand';
      const score = document.createElement('span');
      score.className = 'score-pill';
      score.textContent = '—';
      score.setAttribute('aria-hidden', 'true');
      head.append(label, score);

      const cards = document.createElement('div');
      cards.className = 'cards';
      cards.setAttribute('aria-hidden', 'true');
      appendGhosts(cards, 2);

      const bet = document.createElement('p');
      bet.className = 'hand-bet';
      bet.textContent = 'No wager yet';

      empty.append(head, cards, bet);
      els.playerHands.append(empty);
      return;
    }

    state.hands.forEach((hand, index) => {
      const isActive = state.phase === 'player' && index === state.activeHand && !hand.done && !state.busy;
      const article = document.createElement('article');
      article.className = isActive ? 'hand is-active' : 'hand';
      article.dataset.handIndex = String(index);

      const labelText = state.hands.length > 1 ? `Hand ${index + 1}` : 'Your hand';
      const result = hand.result ? resultLabel(hand.result) : '';
      const ariaParts = [labelText];
      if (isActive) ariaParts.push('active hand');
      if (result) ariaParts.push(result);
      if (hand.cards.length) ariaParts.push(scoreText(hand.cards));
      article.setAttribute('aria-label', ariaParts.join(', '));

      const head = document.createElement('div');
      head.className = 'hand-head';
      const label = document.createElement('span');
      label.className = 'hand-label';
      label.textContent = labelText;

      const value = handValue(hand.cards);
      const score = document.createElement('span');
      score.className = 'score-pill';
      score.textContent = hand.cards.length ? scoreText(hand.cards) : '—';
      if (hand.cards.length && value.soft && value.total !== 21) score.classList.add('is-soft');
      if (value.total > 21) score.classList.add('is-bust');
      score.setAttribute('aria-hidden', 'true');

      head.append(label, score);

      if (hand.result) {
        const badge = document.createElement('span');
        badge.className = `hand-result hand-result--${hand.result}`;
        badge.textContent = result;
        head.append(badge);
      }

      const cards = document.createElement('div');
      cards.className = 'cards';
      if (hand.cards.length) {
        renderCards(cards, hand.cards);
      } else {
        appendGhosts(cards, 2);
      }

      const bet = document.createElement('p');
      bet.className = 'hand-bet';
      let betText = `Bet ${formatChips(hand.bet)}`;
      if (hand.doubled) betText += ' · doubled';
      bet.textContent = betText;

      article.append(head, cards, bet);
      els.playerHands.append(article);
    });
  }

  function renderShoe() {
    const remaining = state.shoe.length;
    els.shoeProgress.value = remaining;
    els.shoeProgress.setAttribute('aria-valuetext', `${remaining} of ${CONFIG.TOTAL_CARDS} cards remaining`);
    els.shoeValue.textContent = String(remaining);
  }

  let flashTimer = 0;
  function renderBankroll(flash = false) {
    els.bankroll.textContent = formatChips(state.bankroll);
    if (!flash) return;
    window.clearTimeout(flashTimer);
    els.bankroll.classList.remove('is-flashing');
    void els.bankroll.offsetWidth;
    els.bankroll.classList.add('is-flashing');
    flashTimer = window.setTimeout(() => {
      els.bankroll.classList.remove('is-flashing');
    }, 620);
  }

  function renderStats() {
    const decided = state.stats.wins + state.stats.losses;
    const winRate = decided > 0 ? `${Math.round((state.stats.wins / decided) * 100)}%` : '—';
    els.statHands.textContent = chipFormat.format(state.stats.hands);
    els.statWinrate.textContent = winRate;
    els.statBlackjacks.textContent = chipFormat.format(state.stats.blackjacks);
    els.statBest.textContent = formatChips(state.stats.best);
  }

  function syncBetControls() {
    const canChoose = (state.phase === 'betting' || state.phase === 'settled') && !state.busy;
    const selected = els.betInputs.find((input) => input.checked);

    if (canChoose && selected && Number(selected.value) > state.bankroll) {
      const affordable = els.betInputs.filter((input) => Number(input.value) <= state.bankroll);
      const fallback = affordable[affordable.length - 1];
      if (fallback) {
        fallback.checked = true;
        state.bet = Number(fallback.value);
        save();
      }
    }

    for (const input of els.betInputs) {
      input.disabled = !canChoose || Number(input.value) > state.bankroll;
    }
  }

  function canDouble(hand) {
    return Boolean(
      hand &&
      hand.cards.length === 2 &&
      !hand.done &&
      !hand.noResplit &&
      state.bankroll >= hand.bet
    );
  }

  function canSplit(hand) {
    return Boolean(
      hand &&
      state.hands.length < CONFIG.MAX_HANDS &&
      hand.cards.length === 2 &&
      !hand.done &&
      !hand.noResplit &&
      state.bankroll >= hand.bet &&
      hand.cards[0].rank.value === hand.cards[1].rank.value
    );
  }

  function renderControls() {
    syncBetControls();

    const playerPhase = state.phase === 'player';
    const active = state.hands[state.activeHand];
    const canAct = playerPhase && !state.busy && Boolean(active) && !active.done;

    els.actionBar.hidden = !playerPhase;
    els.deal.hidden = playerPhase;
    els.game.dataset.phase = state.phase;
    els.game.setAttribute('aria-busy', String(state.busy));

    els.hit.disabled = !canAct;
    els.stand.disabled = !canAct;
    els.double.disabled = !canAct || !canDouble(active);
    els.split.disabled = !canAct || !canSplit(active);

    const canDeal = (state.phase === 'betting' || state.phase === 'settled') &&
      !state.busy &&
      state.bankroll >= state.bet;
    els.deal.disabled = !canDeal;

    let label = 'Deal';
    if (state.phase === 'dealing') label = 'Dealing…';
    else if (state.phase === 'dealer') label = 'Dealer plays…';
    else if (state.bankroll < CONFIG.MIN_BET) label = 'Out of chips';
    else if (state.phase === 'settled') label = 'Deal again';
    els.dealLabel.textContent = label;
  }

  function renderAll(options = {}) {
    renderDealer();
    renderHands();
    renderShoe();
    renderBankroll(Boolean(options.flashBankroll));
    renderStats();
    renderControls();
    syncSound();
  }

  /* Game logic ------------------------------------------------------------ */

  function getSelectedBet() {
    const selected = els.betInputs.find((input) => input.checked);
    const value = selected ? Number(selected.value) : state.bet;
    return ALLOWED_BETS.includes(value) ? value : state.bet;
  }

  function setBetInput(value) {
    const next = ALLOWED_BETS.includes(Number(value)) ? Number(value) : 25;
    for (const input of els.betInputs) {
      input.checked = Number(input.value) === next;
    }
    state.bet = next;
  }

  async function startRound() {
    if (state.busy || (state.phase !== 'betting' && state.phase !== 'settled')) return;

    const bet = getSelectedBet();
    state.bet = bet;

    if (state.bankroll < bet) {
      setMessage(`You need at least ${formatChips(bet)} virtual chips. Reset the table for a fresh bankroll.`, 'loss');
      return;
    }

    const freshShoe = state.shoe.length < CONFIG.RESHUFFLE_AT;
    if (freshShoe) state.shoe = newShoe();

    const token = ++roundToken;
    state.settled = false;
    state.busy = true;
    state.phase = 'dealing';
    state.roundStart = state.bankroll;
    state.bankroll = round2(state.bankroll - bet);
    state.hands = [createHand(bet)];
    state.activeHand = 0;
    state.dealer = { cards: [], holeHidden: true };
    state.roundNet = 0;

    setMessage(freshShoe ? 'Fresh six-deck shoe. Shuffling and dealing…' : 'Dealing…');
    playSound(freshShoe ? 'flip' : 'deal');
    renderAll({ flashBankroll: true });

    const order = ['player', 'dealer', 'player', 'dealer'];
    for (const seat of order) {
      await delay(155);
      if (token !== roundToken) return;
      if (seat === 'player') {
        state.hands[0].cards.push(drawCard());
      } else {
        state.dealer.cards.push(drawCard());
      }
      playSound('deal');
      renderAll();
    }

    await delay(210);
    if (token !== roundToken) return;

    state.busy = false;
    const playerNatural = isNatural(state.hands[0].cards);
    const dealerNatural = isNatural(state.dealer.cards);

    if (playerNatural || dealerNatural) {
      state.dealer.holeHidden = false;
      state.phase = 'settled';
      settleRound();
      renderAll({ flashBankroll: true });
      focusPrimary();
      return;
    }

    state.phase = 'player';
    setMessage(`Your move — ${scoreText(state.hands[0].cards)}. Hit, stand, double or split.`);
    renderAll();
    focusPrimary();
  }

  function splitActiveHand() {
    const index = state.activeHand;
    const hand = state.hands[index];
    if (!canSplit(hand)) return false;

    const baseBet = hand.bet;
    state.bankroll = round2(state.bankroll - baseBet);

    const isAces = hand.cards[0].rank.key === 'A';
    const first = createHand(baseBet);
    const second = createHand(baseBet);
    first.isSplit = true;
    second.isSplit = true;
    first.noResplit = isAces;
    second.noResplit = isAces;
    first.cards = [hand.cards[0], drawCard()];
    second.cards = [hand.cards[1], drawCard()];

    if (isAces) {
      first.done = true;
      second.done = true;
    } else {
      if (handValue(first.cards).total === 21) first.done = true;
      if (handValue(second.cards).total === 21) second.done = true;
    }

    state.hands.splice(index, 1, first, second);
    state.activeHand = index;
    playSound('chip');
    playSound('deal');

    if (isAces) {
      setMessage('Split aces receive one card each. The dealer plays.');
    } else if (first.done && second.done) {
      setMessage('Both split hands stand on 21. The dealer plays.', 'win');
    } else if (first.done) {
      setMessage('The first split hand stands on 21. Playing the next hand.', 'win');
    } else {
      setMessage('Hand split. Playing the first hand.');
    }
    return true;
  }

  async function playerAction(action) {
    if (state.phase !== 'player' || state.busy) return;

    const index = state.activeHand;
    const hand = state.hands[index];
    if (!hand || hand.done || hand.busted) return;

    if (action === 'hit' && els.hit.disabled) return;
    if (action === 'stand' && els.stand.disabled) return;
    if (action === 'double' && els.double.disabled) return;
    if (action === 'split' && els.split.disabled) return;

    const token = roundToken;
    state.busy = true;

    if (action === 'hit') {
      hand.cards.push(drawCard());
      playSound('deal');
      const value = handValue(hand.cards);
      if (value.total > 21) {
        hand.busted = true;
        hand.done = true;
        hand.result = 'bust';
        setMessage(`${handName(index)} busts with ${value.total}.`, 'loss');
      } else if (value.total === 21) {
        hand.done = true;
        setMessage(`${handName(index)} hits 21 and stands.`, 'win');
      } else {
        setMessage(`${handName(index)}: ${scoreText(hand.cards)}. Hit or stand.`);
      }
    } else if (action === 'stand') {
      hand.done = true;
      playSound('flip');
      setMessage(`${handName(index)} stands on ${scoreText(hand.cards)}.`);
    } else if (action === 'double') {
      if (state.bankroll < hand.bet) {
        state.busy = false;
        renderAll();
        return;
      }
      state.bankroll = round2(state.bankroll - hand.bet);
      hand.bet = round2(hand.bet * 2);
      hand.doubled = true;
      hand.cards.push(drawCard());
      hand.done = true;
      playSound('chip');
      playSound('deal');
      const value = handValue(hand.cards);
      if (value.total > 21) {
        hand.busted = true;
        hand.result = 'bust';
        setMessage(`Double busts with ${value.total}.`, 'loss');
      } else {
        setMessage(`Doubled to ${scoreText(hand.cards)}.`);
      }
    } else if (action === 'split') {
      if (!splitActiveHand()) {
        state.busy = false;
        return;
      }
    }

    renderAll({ flashBankroll: action === 'double' || action === 'split' });
    await delay(action === 'stand' ? 120 : 280);
    if (token !== roundToken) return;

    state.busy = false;
    await advanceTurn(token);
  }

  async function advanceTurn(token) {
    if (token !== roundToken || state.phase !== 'player') return;

    const nextIndex = state.hands.findIndex((hand) => !hand.done && !hand.busted);
    if (nextIndex === -1) {
      await dealerTurn(token);
      return;
    }

    state.activeHand = nextIndex;
    const hand = state.hands[nextIndex];
    if (hand.cards.length < 2) hand.cards.push(drawCard());

    if (handValue(hand.cards).total === 21 && !isNaturalHand(hand)) {
      hand.done = true;
      renderAll();
      await advanceTurn(token);
      return;
    }

    state.phase = 'player';
    state.busy = false;
    setMessage(`${handName(nextIndex)}: ${scoreText(hand.cards)}. Your move.`);
    renderAll();
    focusPrimary();
  }

  async function dealerTurn(token) {
    if (token !== roundToken) return;

    state.phase = 'dealer';
    state.busy = true;
    state.dealer.holeHidden = false;
    const anyAlive = state.hands.some((hand) => !hand.busted);

    setMessage(anyAlive ? 'Dealer reveals the hole card.' : 'Every hand busts. The dealer reveals the hole card.');
    playSound('flip');
    renderAll();
    await delay(620);
    if (token !== roundToken) return;

    if (anyAlive) {
      while (handValue(state.dealer.cards).total < 17) {
        state.dealer.cards.push(drawCard());
        const value = handValue(state.dealer.cards);
        playSound('deal');
        setMessage(
          value.total > 21 ? `Dealer busts with ${value.total}.` : `Dealer draws to ${scoreText(state.dealer.cards)}.`,
          value.total > 21 ? 'win' : ''
        );
        renderAll();
        await delay(640);
        if (token !== roundToken) return;
      }
    }

    state.busy = false;
    state.phase = 'settled';
    settleRound();
    renderAll({ flashBankroll: true });
    focusPrimary();
  }

  function settleRound() {
    if (state.settled) return;
    state.settled = true;
    state.phase = 'settled';
    state.busy = false;
    state.dealer.holeHidden = false;

    const dealer = handValue(state.dealer.cards);
    const dealerNatural = isNatural(state.dealer.cards);
    let payout = 0;
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let blackjacks = 0;

    for (const hand of state.hands) {
      const value = handValue(hand.cards);
      const natural = isNaturalHand(hand);
      let result;

      if (hand.busted) {
        result = 'bust';
        losses += 1;
      } else if (natural) {
        blackjacks += 1;
        if (dealerNatural) {
          result = 'push';
          payout += hand.bet;
          pushes += 1;
        } else {
          result = 'blackjack';
          payout += round2(hand.bet * (1 + CONFIG.BLACKJACK_PAYS));
          wins += 1;
        }
      } else if (dealerNatural) {
        result = 'lose';
        losses += 1;
      } else if (dealer.total > 21) {
        result = 'win';
        payout += round2(hand.bet * 2);
        wins += 1;
      } else if (value.total > dealer.total) {
        result = 'win';
        payout += round2(hand.bet * 2);
        wins += 1;
      } else if (value.total === dealer.total) {
        result = 'push';
        payout += hand.bet;
        pushes += 1;
      } else {
        result = 'lose';
        losses += 1;
      }

      hand.result = result;
    }

    state.bankroll = round2(state.bankroll + payout);
    state.stats.hands += state.hands.length;
    state.stats.wins += wins;
    state.stats.losses += losses;
    state.stats.pushes += pushes;
    state.stats.blackjacks += blackjacks;
    state.stats.best = Math.max(state.stats.best, state.bankroll);
    state.roundNet = round2(state.bankroll - state.roundStart);

    const net = state.roundNet;
    const absoluteNet = formatChips(Math.abs(net));
    const tone = net > 0 ? 'win' : net < 0 ? 'loss' : 'push';
    const totalHands = state.hands.length;
    const single = totalHands === 1 ? state.hands[0] : null;
    let summary = '';

    if (single) {
      if (single.result === 'blackjack') {
        summary = `Blackjack! You win ${absoluteNet} virtual chips.`;
      } else if (single.result === 'win') {
        summary = `You win ${absoluteNet} virtual chips.`;
      } else if (single.result === 'push') {
        summary = dealerNatural && isNaturalHand(single)
          ? 'Push — both hands have blackjack. Your wager is returned.'
          : 'Push — your wager is returned.';
      } else if (single.result === 'bust') {
        summary = `Bust with ${handValue(single.cards).total}. You lose ${formatChips(single.bet)} virtual chips.`;
      } else if (dealerNatural) {
        summary = `Dealer blackjack. You lose ${absoluteNet} virtual chips.`;
      } else {
        summary = `Dealer wins. You lose ${absoluteNet} virtual chips.`;
      }
    } else if (pushes === totalHands) {
      summary = `Push on all ${totalHands} hands. Your wagers are returned.`;
    } else if (losses === totalHands) {
      summary = `All ${totalHands} hands lose. Net −${absoluteNet} virtual chips.`;
    } else if (wins === totalHands) {
      summary = `All ${totalHands} hands win. Net +${absoluteNet} virtual chips.`;
    } else if (net === 0) {
      summary = `${wins} of ${totalHands} hands win${pushes ? `, ${pushes} push` : ''}. Net zero.`;
    } else {
      summary = `${wins} of ${totalHands} hands win${pushes ? `, ${pushes} push` : ''}. Net ${net > 0 ? '+' : '−'}${absoluteNet} virtual chips.`;
    }

    if (state.bankroll < CONFIG.MIN_BET) {
      summary += ' You are out of virtual chips — use Reset for a fresh 1,000.';
    }

    setMessage(summary, tone);
    playSound(tone === 'win' ? 'win' : tone === 'loss' ? 'lose' : 'push');
    save();
  }

  function resetGame() {
    roundToken += 1;
    state.bankroll = CONFIG.STARTING_BANKROLL;
    state.shoe = newShoe();
    state.dealer = { cards: [], holeHidden: true };
    state.hands = [];
    state.activeHand = 0;
    state.phase = 'betting';
    state.busy = false;
    state.settled = false;
    state.roundStart = state.bankroll;
    state.roundNet = 0;
    state.stats = {
      hands: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      best: CONFIG.STARTING_BANKROLL
    };
    setBetInput(25);
    save();
    setMessage('Table reset. You have 1,000 virtual chips. Choose a bet and press Deal.');
    renderAll({ flashBankroll: true });
    focusPrimary();
  }

  /* Wiring ---------------------------------------------------------------- */

  function bindEvents() {
    els.deal.addEventListener('click', () => {
      void startRound();
    });

    els.hit.addEventListener('click', () => {
      void playerAction('hit');
    });

    els.stand.addEventListener('click', () => {
      void playerAction('stand');
    });

    els.double.addEventListener('click', () => {
      void playerAction('double');
    });

    els.split.addEventListener('click', () => {
      void playerAction('split');
    });

    for (const input of els.betInputs) {
      input.addEventListener('change', () => {
        if (!input.checked) return;
        state.bet = Number(input.value);
        save();
        playSound('chip');
        renderControls();
      });
    }

    els.sound.addEventListener('click', () => {
      state.sound = !state.sound;
      syncSound();
      save();
      if (state.sound) playSound('chip');
    });

    els.reset.addEventListener('click', () => {
      if (typeof els.resetDialog.showModal === 'function') {
        els.resetDialog.returnValue = '';
        els.resetDialog.showModal();
      } else if (window.confirm('Reset your virtual bankroll and session stats to 1,000 chips?')) {
        resetGame();
      }
    });

    els.resetDialog.querySelector('button[value="reset"]').addEventListener('click', () => {
      resetGame();
    });

    els.game.addEventListener('keydown', (event) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest('textarea, select, input[type="text"], input[type="email"]')) return;

      const key = event.key.toLowerCase();
      const actions = {
        h: els.hit,
        s: els.stand,
        d: els.double,
        p: els.split
      };

      if (actions[key] && !actions[key].hidden && !actions[key].disabled) {
        event.preventDefault();
        actions[key].click();
        return;
      }
      if (key === 'n' && !els.deal.hidden && !els.deal.disabled) {
        event.preventDefault();
        els.deal.click();
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        els.sound.click();
      }
    });
  }

  function init() {
    loadSaved();

    if (!ALLOWED_BETS.includes(state.bet)) state.bet = 25;
    setBetInput(state.bet);
    state.shoe = newShoe();
    state.dealer = { cards: [], holeHidden: true };
    state.hands = [];
    state.activeHand = 0;
    state.phase = 'betting';
    state.busy = false;
    state.settled = false;
    state.roundStart = state.bankroll;
    state.stats.best = Math.max(state.stats.best, state.bankroll);

    syncSound();
    renderAll();

    if (state.bankroll < CONFIG.MIN_BET) {
      setMessage('Your virtual bankroll is empty. Use Reset to return to 1,000 chips.', 'loss');
    } else {
      setMessage('Choose a bet, then press Deal. The shoe is ready.');
    }

    save();
  }

  bindEvents();
  init();
})();
