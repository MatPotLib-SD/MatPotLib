import { CloudOff } from 'lucide-react-native';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { theme, type HealthStatus } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

/** Rounded full-width button with primary / secondary / danger variants. */
export function Button({ title, onPress, disabled, loading, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (pressed || isDisabled) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? theme.colors.text : '#FFFFFF'} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'secondary' ? styles.secondaryText : styles.filledText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label?: string;
}

/** Labeled text input matching the mockups: bold label, white rounded box. */
export function Field({ label, style, ...rest }: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.colors.textDisabled}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

/** Centered full-screen loading spinner. */
export function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}

/**
 * Shown when a fetch failed. Deliberately distinct from a screen's empty
 * state: "we couldn't reach the server" and "you have nothing here yet" look
 * identical to a user otherwise, and the difference matters.
 */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying }: ErrorStateProps) {
  return (
    <View style={styles.errorState}>
      <CloudOff size={56} color={theme.colors.textDisabled} strokeWidth={1.5} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorText}>{message}</Text>
      <View style={styles.errorButton}>
        <Button title="Try again" onPress={onRetry} loading={retrying} variant="secondary" />
      </View>
    </View>
  );
}

/** Tiny all-caps section label (mockup "DEVICES" / "NOTIFICATIONS" style). */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

interface ScreenHeaderProps {
  title: string;
  /** Optional right-side accessory (e.g. the "+ Add Plant" pill). */
  right?: React.ReactNode;
}

/** Large in-screen title row used on top-level screens (mockup style). */
export function ScreenHeader({ title, right }: ScreenHeaderProps) {
  return (
    <View style={styles.screenHeader}>
      <Text style={styles.screenTitle}>{title}</Text>
      {right ?? null}
    </View>
  );
}

const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: 'Healthy',
  warn: 'Needs Attention',
  error: 'Needs Attention',
};

/** Tinted "● Healthy" / "● Needs Attention" pill (mockup plant cards). */
export function StatusChip({ status }: { status: HealthStatus }) {
  const bg =
    status === 'ok'
      ? theme.colors.chip.okBg
      : status === 'warn'
        ? theme.colors.chip.warnBg
        : theme.colors.chip.errorBg;
  const fg =
    status === 'ok'
      ? theme.colors.chip.okText
      : status === 'warn'
        ? theme.colors.chip.warnText
        : theme.colors.chip.errorText;
  return (
    <View
      accessibilityLabel={`Health: ${STATUS_LABEL[status]}`}
      style={[styles.chip, { backgroundColor: bg }]}
    >
      <View style={[styles.chipDot, { backgroundColor: fg }]} />
      <Text style={[styles.chipText, { color: fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** "In range" / "Out of range" pill under gauge values (mockup Plant Data). */
export function RangePill({ ok }: { ok: boolean | null }) {
  const bg =
    ok === null ? theme.colors.chip.neutralBg : ok ? theme.colors.chip.okBg : theme.colors.chip.errorBg;
  const fg =
    ok === null
      ? theme.colors.chip.neutralText
      : ok
        ? theme.colors.chip.okText
        : theme.colors.chip.errorText;
  const label = ok === null ? 'No range' : ok ? 'In range' : 'Out of range';
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  danger: {
    backgroundColor: theme.colors.status.error,
  },
  dimmed: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  filledText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: theme.colors.text,
  },
  fieldWrap: {
    gap: theme.spacing.xs + 2,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: theme.colors.text,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm + 2,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  screenTitle: {
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
    color: theme.colors.text,
    flexShrink: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  errorState: {
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorButton: {
    alignSelf: 'stretch',
    marginTop: theme.spacing.sm,
  },
});
