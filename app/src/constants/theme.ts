/**
 * Design tokens (HANDOFF Section 9 / PDD 5.4.4), tuned to the app/mockups
 * visual language: green primary, white cards with soft shadows, pill
 * accents, semantic status colors, spacing 4/8/16/24/32, font sizes 12–32,
 * 44x44 minimum touch targets.
 */
export const theme = {
  colors: {
    primary: '#2E7D32',
    primaryLight: '#E8F5E9',
    primaryDark: '#1B5E20',
    background: '#F4F7F4',
    surface: '#FFFFFF',
    border: '#E2E8E2',
    text: '#1A1F1A',
    textSecondary: '#5F6B5F',
    textDisabled: '#9AA59A',
    status: {
      ok: '#2E7D32',
      warn: '#ED9B00',
      error: '#D32F2F',
      info: '#1976D2',
    },
    severity: {
      high: '#D32F2F',
      medium: '#ED9B00',
      low: '#2E7D32',
      info: '#1976D2',
    } as Record<string, string>,
    /** Identity colors for the four sensor metrics (mockup gauge values). */
    metric: {
      moisture: '#1976D2',
      temp: '#D32F2F',
      humidity: '#1976D2',
      lux: '#ED9B00',
    },
    /** Tinted chip backgrounds + text (e.g. "Healthy" / "Needs Attention"). */
    chip: {
      okBg: '#E8F5E9',
      okText: '#2E7D32',
      warnBg: '#FFF4E0',
      warnText: '#B96A00',
      errorBg: '#FDECEA',
      errorText: '#D32F2F',
      neutralBg: '#EEF1EE',
      neutralText: '#5F6B5F',
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  /** Soft card shadow (iOS shadow* + Android elevation). */
  shadow: {
    card: {
      shadowColor: '#1A1F1A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
  },
  /** Minimum touch target size (a11y). */
  touchTarget: 44,
} as const;

export type HealthStatus = 'ok' | 'warn' | 'error';
