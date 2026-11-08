import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';

import 'signals.dart';

/// Five chimes, one per action, synthesized at runtime.
///
/// No audio assets: the Web client builds the same five shapes with the Web
/// Audio API, and shipping a shared `assets/` folder would mean two sources of
/// truth for what a "平仓" sounds like. Generating PCM here keeps the two in
/// step and keeps the APK free of binary blobs.
///
/// The five differ on **pitch and rhythm**, not pitch alone: at low volume a
/// pure frequency difference collapses, so `close` is a low double-hit and
/// `leverage` a single short tick rather than "a slightly higher beep".
enum WaveShape { sine, triangle, square }

class Note {
  const Note({
    required this.frequency,
    required this.at,
    required this.duration,
    required this.gain,
    required this.wave,
  });

  /// Hz.
  final double frequency;

  /// Seconds from the start of the pattern.
  final double at;

  /// Seconds.
  final double duration;

  /// 0..1, before the envelope.
  final double gain;

  final WaveShape wave;

  /// `784@0.00` — enough to tell two patterns apart in a test.
  String get signature => '${frequency.round()}@${at.toStringAsFixed(2)}';
}

const _sampleRate = 44100;

const patterns = <SignalAction, List<Note>>{
  // 新开仓 — 上行双音，最需要被注意到。
  SignalAction.open: [
    Note(frequency: 784, at: 0, duration: 0.16, gain: 0.28, wave: WaveShape.triangle),
    Note(frequency: 1046, at: 0.14, duration: 0.26, gain: 0.26, wave: WaveShape.triangle),
  ],
  // 加仓 — 单个高音，轻但清晰。
  SignalAction.add: [
    Note(frequency: 1175, at: 0, duration: 0.2, gain: 0.24, wave: WaveShape.sine),
  ],
  // 减仓 — 下行双音，和开仓反向。
  SignalAction.reduce: [
    Note(frequency: 880, at: 0, duration: 0.15, gain: 0.24, wave: WaveShape.triangle),
    Note(frequency: 659, at: 0.13, duration: 0.24, gain: 0.22, wave: WaveShape.triangle),
  ],
  // 平仓 — 低音双击，最沉。
  SignalAction.close: [
    Note(frequency: 392, at: 0, duration: 0.18, gain: 0.3, wave: WaveShape.sine),
    Note(frequency: 294, at: 0.17, duration: 0.34, gain: 0.28, wave: WaveShape.sine),
  ],
  // 调杠杆 — 单次轻点，仓位没动，不必惊动人。
  SignalAction.leverage: [
    Note(frequency: 1318, at: 0, duration: 0.09, gain: 0.16, wave: WaveShape.square),
  ],
};

const soundLabel = <SignalAction, String>{
  SignalAction.open: '上行双音',
  SignalAction.add: '高音单响',
  SignalAction.reduce: '下行双音',
  SignalAction.close: '低音双击',
  SignalAction.leverage: '轻点',
};

/// Render one pattern to a 16-bit mono WAV in memory.
///
/// Pure: same input, same bytes. Exposed so tests can prove the five patterns
/// are actually different rather than trusting the table above.
Uint8List renderWav(List<Note> notes) {
  var end = 0.0;
  for (final note in notes) {
    final stop = note.at + note.duration;
    if (stop > end) end = stop;
  }
  end += 0.05; // let the last decay settle

  final frames = (end * _sampleRate).ceil();
  final mix = Float64List(frames);

  for (final note in notes) {
    final start = (note.at * _sampleRate).round();
    final length = (note.duration * _sampleRate).round();
    final attackFrames = math.max(1, (0.006 * _sampleRate).round());
    for (var i = 0; i < length; i++) {
      final index = start + i;
      if (index >= frames) break;
      final seconds = i / _sampleRate;
      final phase = 2 * math.pi * note.frequency * seconds;
      final raw = switch (note.wave) {
        WaveShape.sine => math.sin(phase),
        WaveShape.triangle => 2 / math.pi * math.asin(math.sin(phase)),
        WaveShape.square => math.sin(phase) >= 0 ? 1.0 : -1.0,
      };
      // Short attack so the note does not click, exponential decay so it
      // sounds like a chime rather than a test tone.
      final attack = math.min(1.0, i / attackFrames);
      final decay = math.exp(-3.2 * (i / length));
      mix[index] += raw * note.gain * attack * decay;
    }
  }

  final dataSize = frames * 2;
  final header = ByteData(44);
  void ascii(int offset, String value) {
    for (var i = 0; i < value.length; i++) {
      header.setUint8(offset + i, value.codeUnitAt(i));
    }
  }

  ascii(0, 'RIFF');
  header.setUint32(4, 36 + dataSize, Endian.little);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  header.setUint32(16, 16, Endian.little);
  header.setUint16(20, 1, Endian.little); // PCM
  header.setUint16(22, 1, Endian.little); // mono
  header.setUint32(24, _sampleRate, Endian.little);
  header.setUint32(28, _sampleRate * 2, Endian.little); // byte rate
  header.setUint16(32, 2, Endian.little); // block align
  header.setUint16(34, 16, Endian.little); // bits per sample
  ascii(36, 'data');
  header.setUint32(40, dataSize, Endian.little);

  final out = Uint8List(44 + dataSize);
  out.setRange(0, 44, header.buffer.asUint8List());

  final samples = ByteData.sublistView(out, 44);
  for (var i = 0; i < frames; i++) {
    final clipped = mix[i].clamp(-1.0, 1.0);
    samples.setInt16(i * 2, (clipped * 32767).round(), Endian.little);
  }
  return out;
}

/// What the alert controller talks to.
///
/// Abstract so widget tests can pass a recorder and never touch a platform
/// channel — a `MissingPluginException` in a test would look like a bug in the
/// alert logic.
abstract class SignalSound {
  bool get muted;
  set muted(bool value);

  /// Returns false when nothing was audible (muted, or the platform refused).
  Future<bool> play(SignalAction action);

  /// Replays a chime for the sound picker, ignoring mute.
  Future<bool> preview(SignalAction action);

  Future<void> dispose();
}

/// The real one: one `AudioPlayer`, WAV bytes rendered once and cached.
class AudioSignalSound implements SignalSound {
  AudioSignalSound({AudioPlayer? player}) : _player = player ?? AudioPlayer();

  final AudioPlayer _player;
  final Map<SignalAction, Uint8List> _cache = {};

  bool _muted = false;

  @override
  bool get muted => _muted;

  @override
  set muted(bool value) => _muted = value;

  Uint8List _bytesFor(SignalAction action) =>
      _cache[action] ??= renderWav(patterns[action] ?? const []);

  @override
  Future<bool> play(SignalAction action) async {
    if (_muted) return false;
    return _emit(action);
  }

  @override
  Future<bool> preview(SignalAction action) => _emit(action);

  Future<bool> _emit(SignalAction action) async {
    try {
      await _player.stop();
      await _player.play(
        BytesSource(_bytesFor(action), mimeType: 'audio/wav'),
        volume: 1.0,
        mode: PlayerMode.lowLatency,
      );
      return true;
    } catch (_) {
      // No audio device, a denied channel, or a headless run: the feed is
      // still correct, so never let a chime take the screen down.
      return false;
    }
  }

  @override
  Future<void> dispose() async {
    try {
      await _player.dispose();
    } catch (_) {
      // Already gone.
    }
  }
}

/// For tests and for the "静音" preference before an audio device exists.
class SilentSound implements SignalSound {
  SilentSound({this.muted = false, this.succeeds = true});

  @override
  bool muted;

  /// Lets a test simulate the platform refusing to make a sound.
  bool succeeds;

  final List<SignalAction> played = [];

  @override
  Future<bool> play(SignalAction action) async {
    if (muted) return false;
    played.add(action);
    return succeeds;
  }

  @override
  Future<bool> preview(SignalAction action) async {
    played.add(action);
    return succeeds;
  }

  @override
  Future<void> dispose() async {}
}
