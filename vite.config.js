import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT : Remplacez par le nom exact de votre dépôt GitHub
  base: '/aerothau-manager/', 
})