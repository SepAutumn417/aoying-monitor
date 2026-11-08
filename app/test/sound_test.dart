import 'package:flutter_test/flutter_test.dart';

import 'package:aoying_monitor/signals.dart';
import 'package:aoying_monitor/sound.dart';

void main() {
  test('every action has a sound and a label', () {
    for (final action in SignalAction.values) {
      expect(patterns[action], isNotNull, reason: '$action 没有声音');
      expect(patterns[action]!, isNotEmpty);
      expect(soundLabel[action], isNotNull, reason: '$action 没有说明');
    }
  });

  test('the five patterns are distinguishable by pitch and rhythm', () {
    final signatures = <String>{};
    for (final action in SignalAction.values) {
      final signature = patterns[action]!.map((note) => note.signature).join('|');
      signatures.add(signature);
    }
    expect(signatures.length, SignalAction.values.length);
  });

  test('each pattern lays its notes out in time order', () {
    for (final action in SignalAction.values) {
      final notes = patterns[action]!;
      for (var i = 1; i < notes.length; i++) {
        expect(
          notes[i].at,
          greaterThanOrEqualTo(notes[i - 1].at),
          reason: '$action 的音符时间倒序',
        );
      }
    }
  });

  test('rendered WAVs are real audio, not silence', () {
    final bytes = renderWav(patterns[SignalAction.open]!);

    // 44-byte header plus at least one frame.
    expect(bytes.length, greaterThan(44));
    expect(String.fromCharCodes(bytes.sublist(0, 4)), 'RIFF');
    expect(String.fromCharCodes(bytes.sublist(8, 12)), 'WAVE');

    var loudest = 0;
    for (var i = 44; i + 1 < bytes.length; i += 2) {
      final sample = (bytes[i] | (bytes[i + 1] << 8)).toSigned(16);
      if (sample.abs() > loudest) loudest = sample.abs();
    }
    expect(loudest, greaterThan(1000), reason: '渲染出来是静音');
  });

  test('the five rendered patterns differ byte for byte', () {
    final digests = <int>{};
    for (final action in SignalAction.values) {
      final bytes = renderWav(patterns[action]!);
      var hash = bytes.length;
      for (var i = 0; i < bytes.length; i += 97) {
        hash = (hash * 31 + bytes[i]) & 0x7fffffff;
      }
      digests.add(hash);
    }
    expect(digests.length, SignalAction.values.length);
  });

  test('silent sound records what it was asked to play', () async {
    final sound = SilentSound();
    expect(await sound.play(SignalAction.open), isTrue);
    expect(await sound.play(SignalAction.close), isTrue);
    expect(sound.played, [SignalAction.open, SignalAction.close]);
  });

  test('muted silent sound plays nothing', () async {
    final sound = SilentSound(muted: true);
    expect(await sound.play(SignalAction.open), isFalse);
    expect(sound.played, isEmpty);
  });

  test('preview ignores mute so the picker still works', () async {
    final sound = SilentSound(muted: true);
    expect(await sound.preview(SignalAction.leverage), isTrue);
    expect(sound.played, [SignalAction.leverage]);
  });
}
