import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import "cesium/Build/Cesium/Widgets/widgets.css";
import App from './App'

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The app root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
