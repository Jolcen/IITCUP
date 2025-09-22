import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  base: '/',
  plugins: [react()],
  assetsInclude: ['**/*.xlsx', '**/*.xlsm', '**/*.xls'],
})
