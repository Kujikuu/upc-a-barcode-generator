import React, { useState, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

function BarcodeGenerator() {
  const [barcodes, setBarcodes] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const validateBarcode = (barcode) => {
    // UPC-A must be exactly 12 numeric digits
    return /^\d{12}$/.test(barcode)
  }

  const handleFileUpload = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

      const processedBarcodes = lines.map(line => {
        const isValid = validateBarcode(line)
        return {
          number: line,
          valid: isValid,
          error: isValid ? null : `Invalid: ${line.length !== 12 ? 'must be 12 digits' : 'must contain only numbers'}`,
          dataUrl: null
        }
      })

      setBarcodes(processedBarcodes)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.type === 'text/plain') {
      handleFileUpload(file)
    } else {
      alert('Please upload a .txt file')
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const generateBarcodes = async () => {
    setIsGenerating(true)

    const updatedBarcodes = await Promise.all(
      barcodes.map(async (barcode) => {
        if (!barcode.valid) return barcode

        // Create a canvas element
        const canvas = document.createElement('canvas')
        canvas.width = 226
        canvas.height = 100

        try {
          JsBarcode(canvas, barcode.number, {
            format: 'UPC',
            width: 2,
            height: 80,
            displayValue: true,
            fontSize: 14,
            margin: 10
          })

          const dataUrl = canvas.toDataURL('image/png')
          return { ...barcode, dataUrl }
        } catch (error) {
          return { ...barcode, valid: false, error: 'Generation failed' }
        }
      })
    )

    setBarcodes(updatedBarcodes)
    setIsGenerating(false)
  }

  const downloadZip = async () => {
    const zip = new JSZip()

    barcodes.forEach((barcode) => {
      if (barcode.valid && barcode.dataUrl) {
        // Convert data URL to binary
        const base64Data = barcode.dataUrl.split(',')[1]
        zip.file(`${barcode.number}.png`, base64Data, { base64: true })
      }
    })

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, 'barcodes.zip')
  }

  const validCount = barcodes.filter(b => b.valid).length
  const invalidCount = barcodes.filter(b => !b.valid).length
  const canDownload = validCount > 0 && barcodes.some(b => b.valid && b.dataUrl)

  return (
    <div className="barcode-generator">
      {/* Upload Area */}
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current.click()}
      >
        <svg className="upload-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p>Drag & drop a .txt file here, or click to browse</p>
        <p className="upload-hint">Each line should contain a 12-digit UPC-A barcode</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Barcode List */}
      {barcodes.length > 0 && (
        <div className="barcode-list">
          <div className="barcode-list-header">
            <h3>Barcodes ({barcodes.length})</h3>
            <div className="stats">
              <span className="stat valid">{validCount} valid</span>
              <span className="stat invalid">{invalidCount} invalid</span>
            </div>
          </div>

          <div className="barcode-items">
            {barcodes.map((barcode, index) => (
              <div key={index} className={`barcode-item ${barcode.valid ? 'valid' : 'invalid'}`}>
                <span className="barcode-number">{barcode.number}</span>
                {barcode.error && <span className="barcode-error">{barcode.error}</span>}
                {barcode.valid && barcode.dataUrl && (
                  <img src={barcode.dataUrl} alt={barcode.number} className="barcode-image" />
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="actions">
            {validCount > 0 && !barcodes.some(b => b.valid && b.dataUrl) && (
              <button
                className="btn btn-primary"
                onClick={generateBarcodes}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Barcodes'}
              </button>
            )}

            {canDownload && (
              <button
                className="btn btn-success"
                onClick={downloadZip}
              >
                Download ZIP ({validCount} barcodes)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BarcodeGenerator
