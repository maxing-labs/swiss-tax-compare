// Colours for the hand-built SVG charts and the breakdown bar, aligned with the tokens in style.css
export const CHART_THEME = {
  grid: "#e3dccf",        // --border-hairline
  axisText: "#6b645e",    // --text-muted
  ink: "#1c1917",         // --text-primary
  accent: "#c1121f",      // --swiss-red
  cursor: "#9a5b0b",      // --amber-warn
  muted: "#a8a29e",
  pointStroke: "#fffdf9"  // --bg-surface
};

export const LEVEL_COLORS = {
  fed: "#1c1917",
  canton: "#c1121f",
  city: "#b45309",
  church: "#5b2a86",
  personal: "#6b645e"
};

// Charts are drawn in the pixel width of their (visible) container so text keeps its size on phones;
// a hidden tab measures 0 and gets the desktop width until it is shown (switchTab redraws it)
export function chartWidth(svg) {
  const w = Math.round(svg.getBoundingClientRect().width);
  return w > 0 ? Math.min(820, Math.max(300, w)) : 820;
}
