import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Sprout, Leaf, TreeDeciduous, Award, CheckCircle } from 'lucide-react-native';
import { colors, spacing, fontSizes } from '../constants/theme';

const options = [
  { id: 'beginner', Icon: Sprout, label: "Total beginner — I've never kept a plant alive" },
  { id: 'some', Icon: Leaf, label: 'Some experience — I have a few plants' },
  { id: 'green', Icon: TreeDeciduous, label: 'Green thumb — I manage a home garden' },
  { id: 'expert', Icon: Award, label: 'Expert — I could run a nursery' },
];

export default function QuizExperienceScreen({ navigation }: any) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.step}>STEP 1 OF 3</Text>
        <Text style={styles.title}>How experienced are you with plants?</Text>
        <Text style={styles.subtitle}>
          This helps us tailor recommendations and alerts to your comfort level.
        </Text>

        <View style={styles.options}>
          {options.map((option) => {
            const isSelected = selected === option.id;
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelected(option.id)}
                activeOpacity={0.7}
              >
                <Icon
                  size={22}
                  color={isSelected ? colors.primary : colors.textSecondary}
                  strokeWidth={1.75}
                  style={styles.optionIcon}
                />
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {isSelected && (
                  <CheckCircle
                    size={22}
                    color={colors.primary}
                    style={styles.checkIcon}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueButton, !selected && styles.continueButtonDisabled]}
          onPress={() => selected && navigation.navigate('QuizGoals')}
          activeOpacity={0.8}
          disabled={!selected}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  step: {
    fontSize: fontSizes.xs,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  options: {
    gap: spacing.md,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 60,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F7F0',
  },
  optionIcon: {
    marginRight: spacing.md,
  },
  optionText: {
    flex: 1,
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: '500',
  },
  optionTextSelected: {
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  continueButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: colors.surface,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
