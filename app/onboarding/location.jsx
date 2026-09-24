import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StepScreen } from '../../src/components/StepScreen.jsx';
import { Button, Field } from '../../src/components/ui.jsx';
import { useOnboarding } from '../../src/state/onboarding.jsx';
import { locationSchema } from '../../src/lib/onboarding.js';
import { check } from '../../src/lib/validation.js';
import { space } from '../../src/theme.js';

/**
 * Step 3, part two — where the business is.
 *
 * Split from the name and phone so neither screen is a wall of inputs, and so the merchant
 * is only ever answering one kind of question at a time: who you are, then where you are.
 */
export default function Location() {
  const router = useRouter();
  const { draft, update } = useOnboarding();
  const { business } = draft;

  const [touched, setTouched] = useState({});
  const cityRef = useRef(null);
  const stateRef = useRef(null);
  const pincodeRef = useRef(null);

  const set = (key) => (value) => update('business', { [key]: value });
  const blur = (key) => () => setTouched((prev) => ({ ...prev, [key]: true }));

  const result = check(locationSchema, {
    address: business.address,
    city: business.city,
    state: business.state,
    pincode: business.pincode,
  });
  const err = (key) => (touched[key] ? result.errors[key] : undefined);

  return (
    <StepScreen
      step={3}
      from={0.58}
      progress={0.7}
      title="Where are you based?"
      subtitle="Add your business address so customers know who they're buying from."
      onBack={() => router.back()}
      footer={
        <Button
          title="Continue"
          size="lg"
          disabled={!result.ok}
          onPress={() => router.push('/onboarding/design')}
        />
      }
    >
      <Field
        label="Address"
        value={business.address}
        onChangeText={set('address')}
        onBlur={blur('address')}
        placeholder="12, MG Road"
        autoCapitalize="words"
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        returnKeyType="next"
        onSubmitEditing={() => cityRef.current?.focus()}
        maxLength={200}
        error={err('address')}
      />

      <Field
        ref={cityRef}
        label="City"
        value={business.city}
        onChangeText={set('city')}
        onBlur={blur('city')}
        placeholder="Hyderabad"
        autoCapitalize="words"
        textContentType="addressCity"
        returnKeyType="next"
        onSubmitEditing={() => stateRef.current?.focus()}
        maxLength={60}
        error={err('city')}
      />

      <View style={styles.pair}>
        <Field
          ref={stateRef}
          containerStyle={styles.state}
          label="State"
          value={business.state}
          onChangeText={set('state')}
          onBlur={blur('state')}
          placeholder="Telangana"
          autoCapitalize="words"
          textContentType="addressState"
          returnKeyType="next"
          onSubmitEditing={() => pincodeRef.current?.focus()}
          maxLength={60}
          error={err('state')}
        />
        <Field
          ref={pincodeRef}
          containerStyle={styles.pincode}
          label="Pincode"
          value={business.pincode}
          onChangeText={(value) => set('pincode')(value.replace(/\D/g, ''))}
          onBlur={blur('pincode')}
          placeholder="500001"
          keyboardType="number-pad"
          textContentType="postalCode"
          maxLength={6}
          error={err('pincode')}
        />
      </View>
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: space.md },
  state: { flex: 1.3 },
  pincode: { flex: 1 },
});
