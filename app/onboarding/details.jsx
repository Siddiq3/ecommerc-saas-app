import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { slugify } from '@storeflick/shared';
import { storeSlug } from '@storeflick/validation';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { Button, Caption, Field } from '../../src/components/ui.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { useT } from '../../src/state/locale.jsx';
import { businesses } from '../../src/api/endpoints.js';
import { detailsSchema } from '../../src/lib/onboarding.js';
import { STOREFRONT_DOMAIN } from '../../src/lib/storefront.js';
import { check } from '../../src/lib/validation.js';
import { colors } from '../../src/theme.js';

/**
 * Step 3, part one — the name customers will see, where to find it, and how to reach it.
 *
 * The store link is derived from the name as it is typed, so most merchants never touch it,
 * but it is shown as a real field: it is their public address, and it is hard to change once
 * people have saved it. Availability is checked live, so "taken" is discovered here rather
 * than as a failure after five more screens.
 */

export default function Details() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft, update } = useOnboarding();
  const { business } = draft;
  const t = useT();
  // Khata only: no website, so no store link to choose. One is still needed to save the shop; it is made from the
  // name plus a random tail (a clash is near impossible) and stays hidden until the owner starts a store.
  const books = draft.usage === 'books';
  const [tail] = useState(() => Math.random().toString(36).slice(2, 7));

  const [touched, setTouched] = useState({});
  const [availability, setAvailability] = useState({ state: 'idle' });
  const slugRef = useRef(null);
  const phoneRef = useRef(null);
  const timer = useRef(null);

  const set = (patch) => update('business', patch);
  const blur = (key) => () => setTouched((prev) => ({ ...prev, [key]: true }));

  // Most merchants run the shop from the number they just signed up with; start there.
  useEffect(() => {
    if (!business.phone) set({ phone: user?.phone ?? draft.account.phone ?? '' });
    // Once, on arrival. Later edits are the merchant's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onName = (value) => {
    if (books) return set({ name: value, slug: `${slugify(value).slice(0, 30).replace(/-+$/, '') || 'shop'}-${tail}` });
    // Suggest a link from the name until the merchant writes their own.
    // Cut to length, a long name could end the link on a hyphen, which the link rule refuses.
    return set(business.slugEdited ? { name: value } : { name: value, slug: slugify(value).slice(0, 40).replace(/-+$/, '') });
  };

  const checkSlug = useCallback(async (candidate) => {
    if (!candidate) return setAvailability({ state: 'idle' });
    // The same rule the API applies, checked first: a link that can never be valid is
    // explained instantly and never costs a request against the rate limit.
    const local = storeSlug.safeParse(candidate);
    if (!local.success) return setAvailability({ state: 'invalid', message: local.error.issues[0].message });
    setAvailability({ state: 'checking' });
    try {
      const result = await businesses.slugAvailable(local.data);
      return setAvailability({ state: result.available ? 'free' : 'taken' });
    } catch (error) {
      return setAvailability({ state: 'invalid', message: error?.fieldErrors?.slug ?? error?.message });
    }
  }, []);

  // Debounced: a request per keystroke would flood the endpoint and trip its rate limit.
  useEffect(() => {
    clearTimeout(timer.current);
    if (books) return undefined;
    timer.current = setTimeout(() => checkSlug(business.slug), 450);
    return () => clearTimeout(timer.current);
  }, [business.slug, checkSlug, books]);

  const result = check(detailsSchema, { name: business.name, slug: business.slug, phone: business.phone });
  const canContinue = result.ok && (books || availability.state === 'free');

  const slugProblem = availability.state === 'taken'
    ? 'That link is taken. Try another.'
    : availability.state === 'invalid' ? (availability.message ?? 'That link cannot be used.') : undefined;

  return (
    <StepScreen
      step={3}
      from={0.42}
      progress={0.58}
      title="Tell us about your business"
      subtitle={books ? t('This is printed on your bills.') : 'This is how your store will appear to customers.'}
      onBack={() => router.back()}
      footer={
        <Button
          title="Continue"
          size="lg"
          disabled={!canContinue}
          onPress={() => router.push('/onboarding/location')}
        />
      }
    >
      <Field latin
        label="Business name"
        value={business.name}
        onChangeText={onName}
        onBlur={blur('name')}
        placeholder="Business name"
        autoCapitalize="words"
        returnKeyType="next"
        onSubmitEditing={() => (books ? phoneRef : slugRef).current?.focus()}
        maxLength={80}
        error={touched.name ? result.errors.name : undefined}
      />

      {books ? null : <Field
        ref={slugRef}
        label="Store link"
        value={business.slug}
        onChangeText={(value) => set({ slug: value, slugEdited: true })}
        // One short word: the domain suffix beside it (".storeflick.in") leaves about seven characters at 320dp with 1.3x
        // text; "Store link" wrapped and "yourshop" clipped.
        placeholder="myshop"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
        maxLength={40}
        right={(
          <View style={styles.suffix}>
            <Caption style={styles.domain}>.{STOREFRONT_DOMAIN}</Caption>
            <AvailabilityMark state={availability.state} />
          </View>
        )}
        hint={availability.state === 'free' ? 'That link is yours.' : 'The address customers will type. Hard to change later.'}
        error={slugProblem}
      />}

      <Field
        ref={phoneRef}
        label="Business phone"
        value={business.phone}
        onChangeText={(value) => set({ phone: value })}
        onBlur={blur('phone')}
        placeholder="10-digit mobile"
        keyboardType="phone-pad"
        autoComplete="tel"
        prefix="+91"
        maxLength={17}
        hint={books ? t('Printed on your bills and reminders.') : 'Customers can call or WhatsApp you on this number.'}
        error={touched.phone ? result.errors.phone : undefined}
      />
    </StepScreen>
  );
}

/** The live state of the link check, inside the field itself where the typing happens. */
const AvailabilityMark = ({ state }) => {
  if (state === 'checking') return <Caption>…</Caption>;
  if (state === 'free') return <Ionicons name="checkmark-circle" size={20} color={colors.success} />;
  if (state === 'taken' || state === 'invalid') return <Ionicons name="close-circle" size={20} color={colors.danger} />;
  return null;
};

const styles = StyleSheet.create({
  suffix: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  domain: { color: colors.ink500, fontSize: 13 },
});
