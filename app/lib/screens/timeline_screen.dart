import 'package:flutter/material.dart';

import '../api.dart';
import '../app_scope.dart';
import '../live.dart';
import '../theme.dart';
import '../widgets/page_header.dart';
import '../widgets/section_card.dart';

const _rangeOptions = ['全部时间', '今日', '近 7 天'];
const _focusOptions = ['重点动态', '本人发言', '全部原文'];
const _kindOptions = ['全部', '媒体', '已编辑', '已删除'];

const _roleLabels = {
  'owner': '熬鹰本人',
  'signal_bot': '交易机器人报告',
  'assistant': '助理',
  'member': '群友',
};

TelegramFocus _focusOf(String label) => switch (label) {
  '本人发言' => TelegramFocus.owner,
  '全部原文' => TelegramFocus.all,
  _ => TelegramFocus.important,
};

TelegramKind _kindOf(String label) => switch (label) {
  '媒体' => TelegramKind.media,
  '已编辑' => TelegramKind.edited,
  '已删除' => TelegramKind.deleted,
  _ => TelegramKind.all,
};

DateTime? _sinceOf(String label) {
  final now = DateTime.now();
  return switch (label) {
    '今日' => DateTime(now.year, now.month, now.day),
    '近 7 天' => now.subtract(const Duration(days: 7)),
    _ => null,
  };
}

String _two(int value) => value.toString().padLeft(2, '0');

String _timeLabel(DateTime? value) {
  if (value == null) return '—';
  final local = value.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(local.year, local.month, local.day);
  final clock = '${_two(local.hour)}:${_two(local.minute)}';
  if (day == today) return clock;
  if (today.difference(day).inDays == 1) return '昨天 $clock';
  return '${_two(local.month)}-${_two(local.day)} $clock';
}

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  ApiClient? _api;
  LiveController? _live;
  int _lastEventId = 0;

  List<ApiTelegramMessage> _messages = const [];
  List<ApiTelegramDialog> _dialogs = const [];
  List<ApiTelegramTopic> _topics = const [];

  int? _chatId;
  int? _topicId;
  String _focus = '重点动态';
  String _kind = '全部';
  String _range = '全部时间';
  String _keyword = '';
  bool _loading = true;
  String _error = '';
  int _generation = 0;
  final Set<int> _expanded = {};

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scope = AppScope.of(context);
    if (identical(_api, scope.session.api)) return;
    _api = scope.session.api;
    if (!identical(_live, scope.live)) {
      _live?.removeListener(_onLive);
      _live = scope.live;
      _lastEventId = _live!.lastEventId;
      _live!.addListener(_onLive);
    }
    _load();
    _loadSources();
  }

  @override
  void dispose() {
    _live?.removeListener(_onLive);
    _generation++;
    super.dispose();
  }

  void _onLive() {
    final live = _live;
    if (live == null) return;
    if (live.lastEventId == _lastEventId) return;
    _lastEventId = live.lastEventId;
    _load();
  }

  Future<void> _loadSources() async {
    final api = _api;
    if (api == null) return;
    try {
      final dialogs = await api.telegramDialogs();
      if (!mounted) return;
      setState(() {
        _dialogs = dialogs.where((item) => item.enabled).toList();
      });
    } on Object {
      if (!mounted) return;
      setState(() => _dialogs = const []);
    }
    final chatId = _chatId;
    if (chatId == null) return;
    await _loadTopics(chatId);
  }

  Future<void> _loadTopics(int chatId) async {
    final api = _api;
    if (api == null) return;
    try {
      final topics = await api.telegramTopics(chatId);
      if (!mounted || _chatId != chatId) return;
      setState(() => _topics = topics.where((item) => item.enabled).toList());
    } on Object {
      if (!mounted) return;
      setState(() => _topics = const []);
    }
  }

  Future<void> _load() async {
    final api = _api;
    if (api == null) return;
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final rows = await api.telegramMessages(
        limit: 100,
        chatId: _chatId,
        topicId: _topicId,
        focus: _focusOf(_focus),
        kind: _kindOf(_kind),
        since: _sinceOf(_range),
        includeRevisions: true,
      );
      if (!mounted || generation != _generation) return;
      setState(() {
        _messages = rows;
        _loading = false;
      });
    } on ApiException catch (err) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = err.message;
        _loading = false;
      });
    } on Object {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = '读取消息失败';
        _loading = false;
      });
    }
  }

  List<ApiTelegramMessage> get _rows {
    final term = _keyword.trim().toLowerCase();
    if (term.isEmpty) return _messages;
    return _messages
        .where(
          (item) =>
              item.text.toLowerCase().contains(term) ||
              item.senderName.toLowerCase().contains(term) ||
              item.topicTitle.toLowerCase().contains(term),
        )
        .toList();
  }

  String? get _chatTitle {
    final chatId = _chatId;
    if (chatId == null) return null;
    for (final item in _dialogs) {
      if (item.chatId == chatId) return item.title;
    }
    return null;
  }

  String? get _topicTitle {
    final topicId = _topicId;
    if (topicId == null) return null;
    for (final item in _topics) {
      if (item.topicId == topicId) return item.title;
    }
    return null;
  }

  void _selectChat(int? chatId) {
    if (_chatId == chatId) return;
    setState(() {
      _chatId = chatId;
      _topicId = null;
      _topics = const [];
    });
    if (chatId != null) {
      _loadTopics(chatId);
    }
    _load();
  }

  void _selectTopic(int? topicId) {
    setState(() => _topicId = topicId);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          PageHeader(
            title: '发言',
            meta: _loading ? '读取中…' : '${rows.length} 条 · $_focus',
            action: IconButton(
              tooltip: '刷新消息',
              onPressed: _load,
              icon: const Icon(Icons.refresh),
            ),
          ),
          _SearchField(
            value: _keyword,
            onChanged: (value) => setState(() => _keyword = value),
          ),
          const SizedBox(height: 10),
          FilterChipRow(
            options: _focusOptions,
            value: _focus,
            onChanged: (value) {
              setState(() => _focus = value);
              _load();
            },
          ),
          const SizedBox(height: 8),
          FilterChipRow(
            options: _kindOptions,
            value: _kind,
            onChanged: (value) {
              setState(() => _kind = value);
              _load();
            },
          ),
          const SizedBox(height: 8),
          FilterChipRow(
            options: _rangeOptions,
            value: _range,
            onChanged: (value) {
              setState(() => _range = value);
              _load();
            },
          ),
          if (_dialogs.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text(
              '会话',
              style: TextStyle(color: AppColors.mist, fontSize: 11),
            ),
            const SizedBox(height: 6),
            FilterChipRow(
              options: ['全部会话', for (final item in _dialogs) item.title],
              value: _chatTitle ?? '全部会话',
              onChanged: (value) {
                if (value == '全部会话') {
                  _selectChat(null);
                  return;
                }
                for (final item in _dialogs) {
                  if (item.title == value) {
                    _selectChat(item.chatId);
                    return;
                  }
                }
              },
            ),
          ],
          if (_topics.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Text(
              '话题',
              style: TextStyle(color: AppColors.mist, fontSize: 11),
            ),
            const SizedBox(height: 6),
            FilterChipRow(
              options: ['全部话题', for (final item in _topics) item.title],
              value: _topicTitle ?? '全部话题',
              onChanged: (value) {
                if (value == '全部话题') {
                  _selectTopic(null);
                  return;
                }
                for (final item in _topics) {
                  if (item.title == value) {
                    _selectTopic(item.topicId);
                    return;
                  }
                }
              },
            ),
          ],
          const SizedBox(height: 12),
          if (_error.isNotEmpty) ...[
            SectionCard(
              child: Row(
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 18,
                    color: AppColors.danger,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _error,
                      style: const TextStyle(
                        color: AppColors.danger,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (!_loading && rows.isEmpty)
            const EmptyState(
              icon: Icons.forum_outlined,
              title: '没有符合条件的消息',
              description: '换个重点筛选或时间范围，或在服务器上确认采集器正在运行。',
            )
          else
            SectionCard(
              padding: EdgeInsets.zero,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < rows.length; i++) ...[
                    if (i > 0)
                      const Divider(
                        height: 1,
                        thickness: 1,
                        color: AppColors.border,
                      ),
                    _MessageTile(
                      message: rows[i],
                      expanded: _expanded.contains(rows[i].id),
                      onToggle: () => setState(() {
                        if (!_expanded.remove(rows[i].id)) {
                          _expanded.add(rows[i].id);
                        }
                      }),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: TextEditingController(text: value)
        ..selection = TextSelection.collapsed(offset: value.length),
      onChanged: onChanged,
      style: const TextStyle(color: AppColors.mistBright, fontSize: 12),
      decoration: const InputDecoration(
        isDense: true,
        hintText: '搜索正文、发言人或话题',
        prefixIcon: Icon(Icons.search, size: 18, color: AppColors.mist),
      ),
    );
  }
}

class _MessageTile extends StatelessWidget {
  const _MessageTile({
    required this.message,
    required this.expanded,
    required this.onToggle,
  });

  final ApiTelegramMessage message;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final role = message.senderRole;
    final roleColor = switch (role) {
      'owner' => AppColors.signal,
      'signal_bot' => AppColors.amber,
      'assistant' => AppColors.mistBright,
      _ => AppColors.mist,
    };
    final bodyColor = message.isDeleted ? AppColors.mist : AppColors.mistBright;

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 11),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _Badge(text: _roleLabels[role] ?? role, color: roleColor),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${message.dialogTitle} · ${message.topicTitle}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.mist, fontSize: 11),
                ),
              ),
              Text(
                _timeLabel(message.postedAt),
                style: const TextStyle(color: AppColors.mist, fontSize: 10),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Text(
                message.senderName,
                style: TextStyle(color: roleColor, fontSize: 11),
              ),
              if (message.isEdited) ...[
                const SizedBox(width: 6),
                const _Badge(text: '已编辑', color: AppColors.amber),
              ],
              if (message.isDeleted) ...[
                const SizedBox(width: 6),
                const _Badge(text: '已删除', color: AppColors.danger),
              ],
              if (message.mediaKind.isNotEmpty) ...[
                const SizedBox(width: 6),
                _Badge(text: message.mediaKind, color: AppColors.mist),
              ],
            ],
          ),
          const SizedBox(height: 7),
          Text(
            message.text.isEmpty ? '（无文本内容）' : message.text,
            style: TextStyle(
              color: bodyColor,
              fontSize: 12,
              height: 1.5,
              decoration: message.isDeleted ? TextDecoration.lineThrough : null,
            ),
          ),
          if (message.revisions.isNotEmpty) ...[
            const SizedBox(height: 6),
            GestureDetector(
              onTap: onToggle,
              child: Row(
                children: [
                  Icon(
                    expanded ? Icons.expand_less : Icons.expand_more,
                    size: 14,
                    color: AppColors.amber,
                  ),
                  Text(
                    expanded
                        ? '收起改前版本'
                        : '改前版本 ${message.revisions.length} 条',
                    style: const TextStyle(color: AppColors.amber, fontSize: 11),
                  ),
                ],
              ),
            ),
            if (expanded)
              for (final revision in message.revisions)
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(top: 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.ink.withValues(alpha: 0.35),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '改于 ${_timeLabel(revision.replacedAt)}',
                        style: const TextStyle(
                          color: AppColors.mist,
                          fontSize: 10,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        revision.text.isEmpty ? '（无文本内容）' : revision.text,
                        style: const TextStyle(
                          color: AppColors.mist,
                          fontSize: 12,
                          height: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
