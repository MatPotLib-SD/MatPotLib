import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { updateMyProfile } from '../../api/client';
import { Button } from '../../components/ui';
import { theme } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner', hint: 'I am new to plant care' },
  { value: 'intermediate', label: 'Intermediate', hint: 'I keep a few plants alive' },
  { value: 'expert', label: 'Expert', hint: 'I know my way around a greenhouse' },
];

const GOAL_OPTIONS = [
  { value: 'keep_plants_alive', label: 'Keep my plants alive' },
  { value: 'watering_reminders', label: 'Get watering reminders' },
  { value: 'track_conditions', label: 'Track light, temp & humidity' },
  { value: 'learn_plant_care', label: 'Learn better plant care' },
];

const PLANT_TYPE_OPTIONS = [
  { value: 'tropical', label: 'Tropical' },
  { value: 'succulent', label: 'Succulents & cacti' },
  { value: 'herb', label: 'Herbs' },
  { value: 'flowering', label: 'Flowering' },
  { value: 'foliage', label: 'Foliage' },
];

interface OptionRowProps {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}

function OptionRow({ label, hint, selected, onPress }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.option, selected && styles.optionSelected]}
    >
      <View style={styles.optionTextWrap}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
      {selected ? (
        <View style={styles.checkCircle}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * 3-step onboarding quiz (experience, goals, plant types) in the mockup
 * style: caps step label, option cards with check circles, pager dots,
 * Continue / Get Started buttons. Answers are saved to the profile via
 * PUT /profiles/me and only affect alert verbosity (beginner = verbose).
 */
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [experience, setExperience] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [plantTypes, setPlantTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function finish() {
    if (!experience) return;
    setSaving(true);
    try {
      await updateMyProfile({
        experience_level: experience,
        goals,
        plant_types: plantTypes,
      });
      await refreshProfile(); // experience_level now set -> RootNavigator shows Main
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    {
      title: 'How experienced are you with plants?',
      helper: 'This helps us tailor recommendations and alerts to your comfort level.',
      canContinue: experience !== null,
      body: EXPERIENCE_LEVELS.map((opt) => (
        <OptionRow
          key={opt.value}
          label={opt.label}
          hint={opt.hint}
          selected={experience === opt.value}
          onPress={() => setExperience(opt.value)}
        />
      )),
    },
    {
      title: 'What do you want help with?',
      helper: 'Select all that apply.',
      canContinue: true,
      body: GOAL_OPTIONS.map((opt) => (
        <OptionRow
          key={opt.value}
          label={opt.label}
          selected={goals.includes(opt.value)}
          onPress={() => toggle(goals, setGoals, opt.value)}
        />
      )),
    },
    {
      title: 'What kinds of plants do you keep?',
      helper: 'Select all that apply.',
      canContinue: true,
      body: PLANT_TYPE_OPTIONS.map((opt) => (
        <OptionRow
          key={opt.value}
          label={opt.label}
          selected={plantTypes.includes(opt.value)}
          onPress={() => toggle(plantTypes, setPlantTypes, opt.value)}
        />
      )),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <View style={[styles.flex, { paddingTop: insets.top + theme.spacing.lg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.stepIndicator}>STEP {step + 1} OF {steps.length}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.hint}>{current.helper}</Text>
        <View style={styles.options}>{current.body}</View>
      </ScrollView>

      <View style={styles.dots}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        {step > 0 ? (
          <View style={styles.footerButton}>
            <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} />
          </View>
        ) : null}
        <View style={styles.footerButton}>
          <Button
            title={isLast ? 'Get Started' : 'Continue'}
            onPress={() => (isLast ? finish() : setStep(step + 1))}
            disabled={!current.canContinue}
            loading={saving}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  stepIndicator: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.primary,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  title: {
    fontSize: theme.fontSize.xl + 2,
    fontWeight: '800',
    color: theme.colors.text,
  },
  hint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  options: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm + theme.spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.touchTarget + 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  optionLabelSelected: {
    color: theme.colors.primaryDark,
  },
  optionHint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.xs + 2,
    paddingVertical: theme.spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: theme.colors.primary,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  footerButton: {
    flex: 1,
  },
});
