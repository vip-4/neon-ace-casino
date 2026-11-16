import 'dart:math';

import 'package:firebase_ai/firebase_ai.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    // The game remains fully playable if Firebase is unavailable.
  }
  runApp(const NeonAceApp());
}

class NeonAceApp extends StatelessWidget {
  const NeonAceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Neon Ace — Free Blackjack',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFE8C879),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF06110E),
      ),
      home: const GamePage(),
    );
  }
}

class PlayingCard {
  const PlayingCard(this.rank, this.suit);

  final String rank;
  final String suit;

  int get points {
    if (rank == 'A') return 11;
    if (rank == 'J' || rank == 'Q' || rank == 'K') return 10;
    return int.parse(rank);
  }

  String get label => '$rank$suit';
  bool get isRed => suit == '♥' || suit == '♦';
}

List<PlayingCard> _newShoe() {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suits = ['♠', '♥', '♦', '♣'];
  final shoe = <PlayingCard>[
    for (var deck = 0; deck < 2; deck++)
      for (final suit in suits)
        for (final rank in ranks) PlayingCard(rank, suit),
  ];
  shoe.shuffle(Random.secure());
  return shoe;
}

int _score(List<PlayingCard> hand) {
  var total = 0;
  var aces = 0;
  for (final card in hand) {
    total += card.points;
    if (card.rank == 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

class GamePage extends StatefulWidget {
  const GamePage({super.key});

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> {
  late List<PlayingCard> _shoe;
  final List<PlayingCard> _player = [];
  final List<PlayingCard> _dealer = [];
  int _chips = 1000;
  int _bet = 50;
  bool _inRound = false;
  bool _hideHole = true;
  String _message = 'Tap Deal to start a hand.';
  String _aiText = '';
  bool _aiBusy = false;

  @override
  void initState() {
    super.initState();
    _shoe = _newShoe();
  }

  PlayingCard _draw() {
    if (_shoe.length < 15) _shoe = _newShoe();
    return _shoe.removeLast();
  }

  void _deal() {
    if (_inRound) {
      setState(() => _message = 'Finish the current hand first.');
      return;
    }
    if (_chips < _bet) {
      setState(() => _message = 'Not enough chips - lower the bet.');
      return;
    }
    _player.clear();
    _dealer.clear();
    _chips -= _bet;
    _player.add(_draw());
    _dealer.add(_draw());
    _player.add(_draw());
    _dealer.add(_draw());
    _inRound = true;
    _hideHole = true;
    _aiText = '';
    if (_score(_player) == 21) {
      _settle();
    } else {
      setState(() => _message = 'Your move - ${_score(_player)}. Hit or stand.');
    }
  }

  void _hit() {
    if (!_inRound) return;
    _player.add(_draw());
    final score = _score(_player);
    if (score > 21) {
      _settle();
    } else {
      setState(() => _message = 'Your move - $score. Hit or stand.');
    }
  }

  void _stand() {
    if (!_inRound) return;
    _hideHole = false;
    while (_score(_dealer) < 17) {
      _dealer.add(_draw());
    }
    _settle();
  }

  void _settle() {
    _hideHole = false;
    final player = _score(_player);
    final dealer = _score(_dealer);
    String outcome;
    if (player > 21) {
      outcome = 'You bust. Dealer wins.';
    } else if (dealer > 21) {
      outcome = 'Dealer busts. You win!';
      _chips += _bet * 2;
    } else if (player > dealer) {
      outcome = 'You win!';
      _chips += _bet * 2;
    } else if (player == dealer) {
      outcome = 'Push - bet returned.';
      _chips += _bet;
    } else {
      outcome = 'Dealer wins.';
    }
    _inRound = false;
    setState(() => _message = '$outcome  (You $player, dealer $dealer)  Chips: $_chips');
  }

  Future<void> _askAi() async {
    if (_aiBusy) return;
    setState(() {
      _aiBusy = true;
      _aiText = '';
    });
    try {
      final model = FirebaseAI.googleAI().generativeModel(model: 'gemini-2.5-flash');
      final response = await model.generateContent([
        Content.text(
          'In at most three short sentences, explain the objective of blackjack '
          'and when a player should hit or stand. Plain text only, no markdown.',
        ),
      ]);
      final text = response.text?.trim();
      setState(() => _aiText = (text == null || text.isEmpty) ? 'No tips returned.' : text);
    } catch (_) {
      setState(() => _aiText = 'AI tips are unavailable in this session. '
          'Basic rule: draw cards to beat the dealer without exceeding 21.');
    } finally {
      setState(() => _aiBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final gold = Theme.of(context).colorScheme.primary;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Neon Ace — Free Blackjack'),
        backgroundColor: const Color(0xFF0D2A21),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Free blackjack, in your browser.',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              const Text(
                'Virtual chips only. Dealer stands on all 17s, blackjack pays 3:2. '
                'No sign-up, no download, no real-money wagering.',
              ),
              const SizedBox(height: 16),
              _infoBar(gold),
              const SizedBox(height: 12),
              _handRow('Dealer', _dealer, _hideHole ? null : _score(_dealer)),
              const SizedBox(height: 12),
              _handRow('You', _player, _score(_player)),
              const SizedBox(height: 16),
              Semantics(
                liveRegion: true,
                child: Text(
                  _message,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 16, color: gold),
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  FilledButton(
                    onPressed: _inRound ? null : _deal,
                    child: const Text('Deal'),
                  ),
                  FilledButton.tonal(
                    onPressed: _inRound ? _hit : null,
                    child: const Text('Hit'),
                  ),
                  FilledButton.tonal(
                    onPressed: _inRound ? _stand : null,
                    child: const Text('Stand'),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: _aiBusy ? null : _askAi,
                icon: _aiBusy
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_awesome),
                label: const Text('Ask Firebase AI for a rule refresher'),
              ),
              if (_aiText.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0D2A21),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_aiText, style: const TextStyle(fontSize: 14)),
                ),
              ],
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 8),
              const Text(
                'About Neon Ace',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              const Text(
                'Neon Ace is a free, single-page blackjack game. The full rules, '
                'basic-strategy reference and FAQ are available on the static site.',
              ),
              const SizedBox(height: 8),
              const SelectableText('https://neon-ace.web.app/'),
              const SizedBox(height: 12),
              Text(
                'This Flutter Web build demonstrates Firebase AI Logic (firebase_ai). '
                'It is client-rendered; crawlers and AI readers should use the static site for indexable content.',
                style: TextStyle(fontSize: 12, color: Colors.grey[400]),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoBar(Color gold) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0D2A21),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('Chips: $_chips', style: TextStyle(fontSize: 16, color: gold)),
          Row(
            children: [
              const Text('Bet: '),
              DropdownButton<int>(
                value: _bet,
                dropdownColor: const Color(0xFF0D2A21),
                items: const [25, 50, 100, 200]
                    .map((v) => DropdownMenuItem<int>(value: v, child: Text('$v')))
                    .toList(),
                onChanged: _inRound
                    ? null
                    : (v) {
                        if (v != null) setState(() => _bet = v);
                      },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _handRow(String title, List<PlayingCard> hand, int? score) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          score == null ? title : '$title ($score)',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 92,
          child: hand.isEmpty
              ? const Text('No cards yet.')
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: hand.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) {
                    final card = hand[index];
                    final hidden = _hideHole && title == 'Dealer' && index == 1;
                    return Semantics(
                      label: hidden ? 'Face-down card' : 'Card ${card.label}',
                      child: Container(
                        width: 62,
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: hidden ? const Color(0xFF123B2E) : const Color(0xFFF5EFE2),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFE8C879), width: 1.5),
                        ),
                        child: Center(
                          child: Text(
                            hidden ? '★' : card.label,
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              color: hidden
                                  ? const Color(0xFFE8C879)
                                  : (card.isRed ? const Color(0xFFB3261E) : const Color(0xFF12100E)),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
