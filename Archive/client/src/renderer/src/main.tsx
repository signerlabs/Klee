import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

import './index.css'

if (document.title !== 'Klee') {
  document.title = 'Klee'
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
