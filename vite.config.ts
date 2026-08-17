import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Le port 5180 est choisi pour ne pas entrer en conflit avec les serveurs npm
// déjà utilisés sur cette machine (3000, 3001, 5173, 5174, 8000).
// strictPort : on préfère un échec franc à un glissement silencieux sur 5181.
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === 'true' ? '/blackjack-drills/' : '/',
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
})
