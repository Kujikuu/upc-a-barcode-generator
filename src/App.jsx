import React from 'react'
import BarcodeGenerator from './BarcodeGenerator'

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>UPC-A Barcode Generator</h1>
        <p>Upload a text file with barcodes (one per line, 12 digits each)</p>
      </header>
      <main>
        <BarcodeGenerator />
      </main>
      <footer className="app-footer">
        <p>Generates UPC-A barcodes</p>
        <p className="credits">
          Made by <a href="https://afifistudio.com" target="_blank" rel="noopener noreferrer">Ahmed Afifi</a>
        </p>
      </footer>
    </div>
  )
}

export default App
