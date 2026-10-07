function generateSvgIcon(emoji, bg, border, glow) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="grad" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="1"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background Card -->
  <rect width="512" height="512" rx="128" fill="${bg}"/>
  <rect width="512" height="512" rx="128" fill="url(#grad)"/>

  <!-- Inner border ring -->
  <rect x="24" y="24" width="464" height="464" rx="108" fill="none" stroke="${border}" stroke-width="6" opacity="0.4"/>

  <!-- Emoji Content -->
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="central" 
        font-family="system-ui, -apple-system, 'Segoe UI Emoji', 'Noto Color Emoji', 'Apple Color Emoji', sans-serif" 
        font-size="240" filter="url(#shadow)">${emoji}</text>
</svg>`;
}

const fs = require('fs');
const path = require('path');

const icons = [
  { file: 'raiden_patcher.svg', emoji: '⚡', bg: '#020814', border: '#33aaff', glow: '#0066ff' },
  { file: 'hog_extractor.svg', emoji: '📦', bg: '#0d1117', border: '#f59e0b', glow: '#d97706' },
  { file: 'afs_station.svg', emoji: '🎵', bg: '#141922', border: '#4fd1c5', glow: '#0d9488' },
  { file: 'ttxt.svg', emoji: '📝', bg: '#0b0f16', border: '#818cf8', glow: '#4f46e5' }
];

const favDir = path.join(__dirname, 'fav');
icons.forEach(icon => {
  const svg = generateSvgIcon(icon.emoji, icon.bg, icon.border, icon.glow);
  fs.writeFileSync(path.join(favDir, icon.file), svg, 'utf8');
  console.log(`Generated SVG: fav/${icon.file}`);
});
