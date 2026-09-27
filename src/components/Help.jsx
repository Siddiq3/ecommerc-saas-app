import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet.jsx';
import { Body, Button, Divider, Touchable } from './ui.jsx';
import { HELP_CONTEXTS, helpQuestion } from '../lib/help.js';
import { colors, fonts, radius, space, type } from '../theme.js';

/**
 * One-tap help: an answer, the sheet that shows it, and the "Need help?" button screens use.
 *
 * All content comes from src/lib/help.js — nothing here knows what any answer says.
 */

/** `**word**` → bold. Nothing else is parsed. */
const Rich = ({ text, style }) => (
  <Text style={style}>
    {text.split('**').map((part, i) => (i % 2 ? <Text key={i} style={styles.bold}>{part}</Text> : part))}
  </Text>
);

export const HelpAnswer = ({ question, onAction }) => (
  <View>
    {question.steps.map((step, i) => (
      <View key={step} style={styles.step}>
        {question.steps.length > 1 ? (
          <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{i + 1}</Text></View>
        ) : null}
        <Rich text={step} style={styles.stepText} />
      </View>
    ))}
    {question.note ? (
      <View style={styles.note}>
        <Ionicons name="bulb-outline" size={16} color={colors.accent700} />
        <Rich text={question.note} style={styles.noteText} />
      </View>
    ) : null}
    {question.action ? (
      <Button title={question.action.label} onPress={() => onAction(question.action)} style={styles.action} />
    ) : null}
  </View>
);

export const QuestionRow = ({ question, onPress, last }) => (
  <>
    <Touchable onPress={onPress} style={styles.questionRow} accessibilityLabel={question.question}>
      <Body style={{ flex: 1 }}>{question.question}</Body>
      <Ionicons name="chevron-forward" size={16} color={colors.ink400} />
    </Touchable>
    {last ? null : <Divider />}
  </>
);

/** Runs an answer's action: an in-app route, or an outside link. */
export const useHelpAction = () => {
  const router = useRouter();
  // navigate, not push: an action pointing at a screen already open goes back to it
  // rather than stacking a second copy.
  return ({ href, url }) => (href ? router.navigate(href) : Linking.openURL(url).catch(() => undefined));
};

/**
 * Shows one answer (`questionId`), or — with `context` — a short list of questions whose
 * answers open in place, plus a way to all of Help.
 */
export const HelpSheet = ({ visible, onClose, questionId, context }) => {
  const router = useRouter();
  const [picked, setPicked] = useState(null);
  const current = helpQuestion(questionId ?? picked);

  const go = useHelpAction();
  const act = (action) => {
    onClose();
    go(action);
  };

  const ids = context ? HELP_CONTEXTS[context] ?? [] : [];

  return (
    <Sheet visible={visible} onClose={onClose} title={current ? current.question : 'Need help?'}>
      {current ? (
        <>
          <HelpAnswer question={current} onAction={act} />
          {picked ? (
            <Touchable onPress={() => setPicked(null)} style={styles.link} accessibilityLabel="Other questions">
              <Ionicons name="arrow-back" size={16} color={colors.accent700} />
              <Body style={styles.linkText}>Other questions</Body>
            </Touchable>
          ) : null}
        </>
      ) : (
        <>
          {ids.map((id, i) => (
            <QuestionRow key={id} question={helpQuestion(id)} onPress={() => setPicked(id)} last={i === ids.length - 1} />
          ))}
          <Touchable
            onPress={() => { onClose(); router.push('/help'); }}
            style={styles.link}
            accessibilityLabel="Ask something else"
          >
            <Body style={styles.linkText}>Ask something else</Body>
            <Ionicons name="arrow-forward" size={16} color={colors.accent700} />
          </Touchable>
        </>
      )}
    </Sheet>
  );
};

/** A round "?" for a screen header; opens that screen's questions. */
export const HelpButton = ({ context, style }) => {
  const [open, setOpen] = useState(false);
  // A new key per opening starts the sheet back on the question list, without resetting it
  // on close — which would swap its content mid slide-out.
  const [opened, setOpened] = useState(0);
  return (
    <>
      <Touchable onPress={() => { setOpened((n) => n + 1); setOpen(true); }} style={[styles.helpButton, style]} accessibilityLabel="Need help?">
        <Ionicons name="help" size={20} color={colors.ink700} />
      </Touchable>
      <HelpSheet key={opened} visible={open} onClose={() => setOpen(false)} context={context} />
    </>
  );
};

const styles = StyleSheet.create({
  bold: { fontFamily: fonts.semibold, color: colors.ink900 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.md },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.accent50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { ...type.caption, fontFamily: fonts.bold, color: colors.accent700 },
  stepText: { ...type.body, color: colors.ink800, flex: 1 },
  note: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: colors.accent50,
    borderRadius: radius.sm,
    padding: space.md,
    marginTop: space.xs,
  },
  noteText: { ...type.body, fontSize: 14, color: colors.ink700, flex: 1 },
  action: { marginTop: space.xl },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, minHeight: 52 },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: space.lg, minHeight: 44 },
  linkText: { ...type.label, color: colors.accent700 },
  helpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
});
