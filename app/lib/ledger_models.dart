// Read-only Telegram ledger contracts. Nullable source values stay nullable.
double? _number(dynamic value) => (value as num?)?.toDouble();
DateTime? _time(dynamic value) =>
    value == null ? null : DateTime.parse(value as String).toLocal();

class LedgerStatus {
  LedgerStatus.fromJson(Map<String, dynamic> json)
    : positionsOpen = json['positions_open'] as int,
      positionsClosed = json['positions_closed'] as int,
      realizedClosed = (json['realized_closed'] as num).toDouble(),
      signals = json['signals'] as int,
      events = json['events'] as int,
      lastSignalAt = _time(json['last_signal_at']);
  final int positionsOpen, positionsClosed, signals, events;
  final double realizedClosed;
  final DateTime? lastSignalAt;
}

class LedgerPositionEvent {
  LedgerPositionEvent.fromJson(Map<String, dynamic> j)
    : id = j['id'] as int,
      kind = j['kind'] as String,
      at = _time(j['at'])!,
      qtyBefore = _number(j['qty_before']),
      qtyAfter = _number(j['qty_after']),
      entry = _number(j['entry']),
      mark = _number(j['mark']),
      margin = _number(j['margin']),
      lev = _number(j['lev']),
      floating = _number(j['floating']),
      realized = _number(j['realized']);
  final int id;
  final String kind;
  final DateTime at;
  final double? qtyBefore, qtyAfter, entry, mark, margin, lev, floating;

  /// Already cumulative at this event. Never sum lifecycle values.
  final double? realized;
}

class LedgerPosition {
  LedgerPosition.fromJson(Map<String, dynamic> j)
    : id = j['id'] as int,
      symbol = j['symbol'] as String,
      side = j['side'] as String,
      status = j['status'] as String,
      openedAt = _time(j['opened_at'])!,
      closedAt = _time(j['closed_at']),
      entry = _number(j['entry']),
      qtyOpen = _number(j['qty_open']),
      qtyCurrent = _number(j['qty_current']),
      lev = _number(j['lev']),
      margin = _number(j['margin']),
      realized = _number(j['realized']),
      heldSeconds = j['held_seconds'] as int,
      events = List.unmodifiable(
        (j['events'] as List? ?? []).map(
          (e) =>
              LedgerPositionEvent.fromJson((e as Map).cast<String, dynamic>()),
        ),
      );
  final int id, heldSeconds;
  final String symbol, side, status;
  final DateTime openedAt;
  final DateTime? closedAt;
  final double? entry, qtyOpen, qtyCurrent, lev, margin, realized;
  final List<LedgerPositionEvent> events;
}

class LedgerSignal {
  LedgerSignal.fromJson(Map<String, dynamic> j)
    : id = j['id'] as int,
      messageId = j['message_id'] as int,
      kind = j['kind'] as String,
      action = j['action'] as String,
      symbol = j['symbol'] as String,
      side = j['side'] as String,
      levTarget = _number(j['lev_target']),
      levActual = _number(j['lev_actual']),
      qty = _number(j['qty']),
      qtyBefore = _number(j['qty_before']),
      qtyAfter = _number(j['qty_after']),
      entry = _number(j['entry']),
      mark = _number(j['mark']),
      margin = _number(j['margin']),
      liq = _number(j['liq']),
      floating = _number(j['floating']),
      realized = _number(j['realized']),
      postedAt = _time(j['posted_at'])!,
      reportedAt = _time(j['reported_at']);
  final int id, messageId;
  final String kind, action, symbol, side;
  final double? levTarget,
      levActual,
      qty,
      qtyBefore,
      qtyAfter,
      entry,
      mark,
      margin,
      liq,
      floating,
      realized;
  final DateTime postedAt;
  final DateTime? reportedAt;
}

class LedgerSnapshot {
  const LedgerSnapshot({
    required this.status,
    required this.positions,
    required this.signals,
  });
  final LedgerStatus status;
  final List<LedgerPosition> positions;
  final List<LedgerSignal> signals;
}
