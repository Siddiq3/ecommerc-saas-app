import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Caption, Touchable } from '../src/components/ui.jsx';
import { FadeIn } from '../src/components/motion.jsx';
import { HelpAnswer, useHelpAction } from '../src/components/Help.jsx';
import { HELP_CATEGORIES, helpQuestion } from '../src/lib/help.js';
import { colors, radius, space } from '../src/theme.js';

/**
 * Help as a support chat — with nothing to type.
 *
 * The assistant offers choices as chips; tapping one posts it as the owner's message and the
 * assistant answers from src/lib/help.js. Every reply is predefined and local: no request
 * is made, nothing is generated. Only the latest message's chips are tappable, so the thread
 * reads like a conversation rather than a menu that keeps growing.
 */

const REPLY_DELAY = 450;

const topicChips = HELP_CATEGORIES.map((c) => ({ label: c.title, icon: c.icon, topic: c.id }));

const greeting = () => [
  { id: 'hello', from: 'bot', text: 'Hi! 👋 How can we help?' },
  { id: 'hello-2', from: 'bot', text: 'Pick a topic and I’ll show you quick answers about managing your store.', chips: topicChips },
];

let nextId = 0;
const msg = (fields) => ({ id: `m${nextId++}`, ...fields });

/** What the assistant says after the owner taps a chip. */
const replyTo = (chip) => {
  if (chip.topic) {
    const category = HELP_CATEGORIES.find((c) => c.id === chip.topic);
    return [
      msg({
        from: 'bot',
        text: `Sure — here’s what people usually ask about ${category.title.toLowerCase()}:`,
        chips: [
          ...category.questions.map((q) => ({ label: q.question, questionId: q.id })),
          { label: 'Other topics', icon: 'apps-outline', allTopics: true },
        ],
      }),
    ];
  }
  if (chip.questionId) {
    const category = HELP_CATEGORIES.find((c) => c.questions.some((q) => q.id === chip.questionId));
    const more = category.questions.filter((q) => q.id !== chip.questionId).slice(0, 3);
    return [
      msg({ from: 'bot', answer: helpQuestion(chip.questionId) }),
      msg({
        from: 'bot',
        text: 'Anything else I can help with?',
        chips: [
          ...more.map((q) => ({ label: q.question, questionId: q.id })),
          { label: 'Other topics', icon: 'apps-outline', allTopics: true },
        ],
      }),
    ];
  }
  return [msg({ from: 'bot', text: 'What would you like help with?', chips: topicChips })];
};

export default function Help() {
  const insets = useSafeAreaInsets();
  const scroll = useRef(null);
  const timer = useRef(null);
  const go = useHelpAction();
  const [messages, setMessages] = useState(greeting);
  const [typing, setTyping] = useState(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const choose = (chip) => {
    if (typing) return;
    setMessages((prev) => [...prev, msg({ from: 'user', text: chip.label })]);
    setTyping(true);
    // A short pause so the answer reads as a reply, not a page swap.
    timer.current = setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, ...replyTo(chip)]);
    }, REPLY_DELAY);
  };

  const last = messages[messages.length - 1];

  return (
    <ScrollView
      ref={scroll}
      style={styles.screen}
      contentContainerStyle={[styles.thread, { paddingBottom: insets.bottom + space.xxl }]}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      showsVerticalScrollIndicator={false}
    >
      {messages.map((m) => (
        <FadeIn key={m.id} from={m.from === 'user' ? 'right' : 'bottom'}>
          {m.from === 'user' ? (
            <View style={[styles.bubble, styles.userBubble]}>
              <Body style={styles.userText}>{m.text}</Body>
            </View>
          ) : (
            <View style={styles.botRow}>
              <Avatar />
              <View style={[styles.bubble, styles.botBubble, m.answer && styles.answerBubble]}>
                {m.answer ? (
                  <>
                    <Body strong style={styles.answerTitle}>{m.answer.question}</Body>
                    <HelpAnswer question={m.answer} onAction={go} />
                  </>
                ) : (
                  <Body>{m.text}</Body>
                )}
              </View>
            </View>
          )}
          {m === last && m.chips && !typing ? (
            <View style={styles.chips}>
              {m.chips.map((chip, i) => (
                <FadeIn key={chip.label} delay={Math.min(i, 6) * 40} style={styles.chipWrap}>
                  <Touchable onPress={() => choose(chip)} style={styles.chip} accessibilityLabel={chip.label}>
                    {chip.icon ? <Ionicons name={chip.icon} size={16} color={colors.accent700} /> : null}
                    <Body style={styles.chipText}>{chip.label}</Body>
                  </Touchable>
                </FadeIn>
              ))}
            </View>
          ) : null}
        </FadeIn>
      ))}

      {typing ? (
        <View style={styles.botRow}>
          <Avatar />
          <View style={[styles.bubble, styles.botBubble]}>
            <Caption style={styles.typing}>•••</Caption>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const Avatar = () => (
  <View style={styles.avatar}>
    <Ionicons name="sparkles" size={15} color={colors.accent700} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  thread: { padding: space.lg, gap: space.md },
  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, maxWidth: '82%' },
  botBubble: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderBottomLeftRadius: radius.xs,
    flexShrink: 1,
  },
  answerBubble: { flex: 1, maxWidth: '100%', paddingVertical: space.lg },
  answerTitle: { marginBottom: space.md },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent600,
    borderBottomRightRadius: radius.xs,
  },
  userText: { color: '#ffffff' },
  typing: { letterSpacing: 3, fontSize: 18, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md, paddingLeft: 30 + space.sm },
  chipWrap: { maxWidth: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.accent200,
    backgroundColor: colors.surface,
  },
  chipText: { fontSize: 14.5, color: colors.accent700, flexShrink: 1 },
});
