import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { Sprout, Leaf, Flower2, TreePalm, CheckCircle } from 'lucide-react-native';
import { colors, spacing, fontSizes } from '../constants/theme';

const options = [
  { id: 'houseplants', Icon: Sprout, label: 'Houseplants (pothos, ferns, monstera)' },
  { id: 'herbs', Icon: Leaf, label: 'Herbs (basil, mint, rosemary)' },
  { id: 'flowering', Icon: Flower2, label: 'Flowering plants (orchids, peace lily)' },
  { id: 'succulents', Icon: TreePalm, label: 'Succulents & cacti' },
];

export default function QuizPlantsScreen({ navigation }: any) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleOption = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.step}>STEP 3 OF 3</Text>
        <Text style={styles.title}>What types of plants do you have or want?</Text>
        <Text style={styles.subtitle}>
          We'll pre-load care profiles for these species so setup is faster.
        </Text>

        <View style={styles.options}>
          {options.map((option) => {
            const isSelected = selected.includes(option.id);
            const Icon = option.Icon;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => toggleOption(option.id)}
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
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotActive]} />
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.getStartedButton, selected.length === 0 && styles.getStartedButtonDisabled]}
          onPress={() => {
            if (selected.length > 0) {
              // TODO: navigate to Home with navigation.reset
            }
          }}
          activeOpacity={0.8}
          disabled={selected.length === 0}
        >
          <Text style={styles.getStartedButtonText}>Get Started</Text>
          <Sprout size={18} color={colors.surface} style={{ marginLeft: spacing.sm }} />
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
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  backButtonText: {
    fontSize: fontSizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  getStartedButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getStartedButtonDisabled: {
    opacity: 0.5,
  },
  getStartedButtonText: {
    color: colors.surface,
    fontSize: fontSizes.md,
    fontWeight: '600',
  },
});
