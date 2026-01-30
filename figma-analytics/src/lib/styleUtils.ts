/**
 * Style utilities for consistent color usage across the application
 * All colors reference CSS variables defined in index.css
 * 
 * These utilities automatically adapt to light/dark theme through CSS variables.
 * Dark theme is controlled via data-theme attribute on html element.
 */

export const styleColors = {
  sidebar: 'var(--color-muted)',
  border: 'var(--color-border)',
  inputBorder: 'var(--color-input)',
  destructive: 'var(--color-destructive)',
  destructiveBg: 'var(--color-destructive-bg)',
  warning: 'var(--color-warning)',
  warningBg: 'var(--color-warning-bg)',
  info: 'var(--color-info)',
  infoBg: 'var(--color-info-bg)',
  mutedText: 'var(--color-muted-foreground)',
  primary: 'var(--color-primary)',
} as const;

export const chartColors = {
  primary: 'var(--color-chart-primary)',
  secondary: 'var(--color-chart-secondary)',
  muted: 'var(--color-muted-foreground)',
  destructive: 'var(--color-destructive)',
  accent: 'var(--color-chart-accent)',
} as const;

/**
 * Helper function to get color value by key
 */
export function getStyleColor(key: keyof typeof styleColors): string {
  return styleColors[key];
}

/**
 * Helper function to get chart color value by key
 */
export function getChartColor(key: keyof typeof chartColors): string {
  return chartColors[key];
}
