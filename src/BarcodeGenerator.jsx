import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import JsBarcode from 'jsbarcode'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

const BATCH_SIZE = 50
const CM_TO_PIXEL = 118.11 // 300 DPI (300 / 2.54)
const DEFAULT_WIDTH_CM = 2.2
const DEFAULT_HEIGHT_CM = 0.9557
const ASPECT_RATIO = DEFAULT_WIDTH_CM / DEFAULT_HEIGHT_CM

function BarcodeGenerator() {
  // Settings state
  const [showNumbers, setShowNumbers] = useState(true)
  const [exportFormat, setExportFormat] = useState('png')
  const [widthCm, setWidthCm] = useState(DEFAULT_WIDTH_CM)
  const [heightCm, setHeightCm] = useState(DEFAULT_HEIGHT_CM)
  const [lockRatio, setLockRatio] = useState(true)

  // Input state (separate from actual state to avoid circular updates)
  const [widthInput, setWidthInput] = useState(DEFAULT_WIDTH_CM.toFixed(2))
  const [heightInput, setHeightInput] = useState(DEFAULT_HEIGHT_CM.toFixed(4))

  // Barcode state
  const [barcodes, setBarcodes] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const fileInputRef = useRef(null)
  const isUpdatingRef = useRef(false)

  // Sync inputs with state when not being edited
  useEffect(() => {
    if (!isUpdatingRef.current) {
      setWidthInput(widthCm.toFixed(2))
      setHeightInput(heightCm.toFixed(4))
    }
  }, [widthCm, heightCm])

  // Calculate dimensions in pixels
  const dimensions = useMemo(() => ({
    widthPx: Math.round(widthCm * CM_TO_PIXEL),
    heightPx: Math.round(heightCm * CM_TO_PIXEL),
    widthCm,
    heightCm
  }), [widthCm, heightCm])

  // Handle width change
  const handleWidthChange = (value) => {
    setWidthInput(value)
    isUpdatingRef.current = true
    const newWidth = parseFloat(value) || DEFAULT_WIDTH_CM
    setWidthCm(newWidth)
    if (lockRatio) {
      const newHeight = newWidth / ASPECT_RATIO
      setHeightCm(newHeight)
      setHeightInput(newHeight.toFixed(4))
    }
    setTimeout(() => { isUpdatingRef.current = false }, 0)
  }

  // Handle height change
  const handleHeightChange = (value) => {
    setHeightInput(value)
    isUpdatingRef.current = true
    const newHeight = parseFloat(value) || DEFAULT_HEIGHT_CM
    setHeightCm(newHeight)
    if (lockRatio) {
      const newWidth = newHeight * ASPECT_RATIO
      setWidthCm(newWidth)
      setWidthInput(newWidth.toFixed(2))
    }
    setTimeout(() => { isUpdatingRef.current = false }, 0)
  }

  // Convert SVG path data to EPS
  const svgPathToEps = (pathData) => {
    // Convert SVG path to PostScript commands
    let eps = pathData
      // Move commands
      .replace(/M\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, '$1 $2 moveto')
      .replace(/m\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, '$1 $2 rmoveto')
      // Line commands
      .replace(/L\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, '$1 $2 lineto')
      .replace(/l\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g, '$1 $2 rlineto')
      // Horizontal line
      .replace(/H\s+(-?\d+\.?\d*)/g, '$1 lineto')
      .replace(/h\s+(-?\d+\.?\d*)/g, '$1 rlineto')
      // Vertical line
      .replace(/V\s+(-?\d+\.?\d*)/g, 'exch $1 lineto')
      .replace(/v\s+(-?\d+\.?\d*)/g, 'exch $1 rlineto')
      // Close path
      .replace(/Z/g, 'closepath')
      .replace(/z/g, 'closepath')
      // Cubic bezier
      .replace(/C\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,
        '$1 $2 $3 $4 $5 $6 curveto')
      .replace(/c\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,
        '$1 $2 $3 $4 $5 $6 rcurveto')
      // Remove extra commas and spaces
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return eps
  }

  // Convert SVG to EPS format
  const svgToEps = (svgString, widthCm, heightCm) => {
    try {
      // Extract the viewBox to get original dimensions
      const viewBoxMatch = svgString.match(/viewBox="([^"]*)"/)
      let vbX = 0, vbY = 0, vbWidth = 100, vbHeight = 50

      if (viewBoxMatch) {
        const coords = viewBoxMatch[1].split(/\s+/).map(Number)
        if (coords.length === 4) {
          [vbX, vbY, vbWidth, vbHeight] = coords
        }
      }

      // Get all path elements
      const pathRegex = /<path[^>]*d="([^"]*)"[^>]*>/g
      const paths = []
      let match
      while ((match = pathRegex.exec(svgString)) !== null) {
        paths.push(match[1])
      }

      // Get all rect elements
      const rectRegex = /<rect[^>]*x="([^"]*)"[^>]*y="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"[^>]*>/g
      let rectMatch
      while ((rectMatch = rectRegex.exec(svgString)) !== null) {
        const x = parseFloat(rectMatch[1])
        const y = parseFloat(rectMatch[2])
        const w = parseFloat(rectMatch[3])
        const h = parseFloat(rectMatch[4])
        paths.push(`M ${x} ${y} h ${w} v ${h} h ${-w} Z`)
      }

      if (paths.length === 0) {
        return null
      }

      // Calculate scale to fit in the target dimensions
      const scaleX = (widthCm * 28.35) / vbWidth
      const scaleY = (heightCm * 28.35) / vbHeight

      // Convert paths to PostScript
      const psPaths = paths.map(p => svgPathToEps(p)).join('\n')

      // Create EPS file
      const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${Math.round(widthCm * 28.35)} ${Math.round(heightCm * 28.35)}
%%Creator: Barcode Generator
%%Title: Barcode
%%EndComments

% Save state
save

% Set up coordinate system
${scaleX} ${scaleY} scale
${-vbX} ${-vbY} translate

% Draw barcode
newpath
${psPaths}
fill

% Restore state
restore

%%EOF
`
      return eps
    } catch (error) {
      console.error('EPS conversion error:', error)
      return null
    }
  }

  const validateBarcode = (barcode) => {
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
          dataUrl: null,
          svgString: null
        }
      })

      setBarcodes(processedBarcodes)
      setProgress({ current: 0, total: 0 })
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

  const generateSingleBarcode = useCallback((barcode, format, dims, showNum) => {
    const { widthPx, heightPx } = dims

    // Calculate barcode height - use full height when numbers are hidden
    const barHeight = showNum ? Math.max(heightPx - 30, 40) : heightPx - 20

    const barcodeOptions = {
      format: 'UPC',
      displayValue: showNum,
      width: 2,
      height: barHeight,
      margin: 10,
      fontSize: showNum ? Math.min(14, heightPx / 6) : 0
    }

    try {
      if (format === 'png') {
        const canvas = document.createElement('canvas')
        canvas.width = widthPx
        canvas.height = heightPx
        JsBarcode(canvas, barcode.number, barcodeOptions)
        return { ...barcode, dataUrl: canvas.toDataURL('image/png'), svgString: null }
      } else {
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        JsBarcode(svgElement, barcode.number, barcodeOptions)
        const svgString = svgElement.outerHTML
        return { ...barcode, dataUrl: null, svgString }
      }
    } catch (error) {
      return { ...barcode, valid: false, error: 'Generation failed', dataUrl: null, svgString: null }
    }
  }, [])

  const generateBarcodes = async () => {
    setIsGenerating(true)
    setProgress({ current: 0, total: barcodes.filter(b => b.valid).length })

    const currentDimensions = dimensions
    const currentFormat = exportFormat
    const currentShowNumbers = showNumbers

    let updatedBarcodes = [...barcodes]

    for (let i = 0; i < updatedBarcodes.length; i += BATCH_SIZE) {
      const batch = updatedBarcodes.slice(i, i + BATCH_SIZE)
      const processedBatch = await Promise.all(
        batch.map(async (barcode) => {
          if (!barcode.valid) return barcode
          return generateSingleBarcode(barcode, currentFormat, currentDimensions, currentShowNumbers)
        })
      )

      processedBatch.forEach((processedBarcode, batchIndex) => {
        updatedBarcodes[i + batchIndex] = processedBarcode
      })

      setBarcodes([...updatedBarcodes])
      setProgress({ current: Math.min(i + BATCH_SIZE, updatedBarcodes.filter(b => b.valid).length), total: barcodes.filter(b => b.valid).length })

      await new Promise(resolve => setTimeout(resolve, 10))
    }

    setIsGenerating(false)
    setProgress({ current: 0, total: 0 })
  }

  const downloadZip = async () => {
    const zip = new JSZip()

    barcodes.forEach((barcode) => {
      if (barcode.valid) {
        const extension = exportFormat
        if (exportFormat === 'png' && barcode.dataUrl) {
          const base64Data = barcode.dataUrl.split(',')[1]
          zip.file(`${barcode.number}.${extension}`, base64Data, { base64: true })
        } else if (exportFormat === 'svg' && barcode.svgString) {
          zip.file(`${barcode.number}.${extension}`, barcode.svgString)
        }
      }
    })

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, `barcodes.${exportFormat}.zip`)
  }

  const validCount = barcodes.filter(b => b.valid).length
  const invalidCount = barcodes.filter(b => !b.valid).length
  const canDownload = validCount > 0 && barcodes.some(b => b.valid && (b.dataUrl || b.svgString))
  const showProgress = isGenerating && progress.total > 0

  const renderBarcodePreview = (barcode) => {
    if (barcode.valid && barcode.dataUrl) {
      return <img src={barcode.dataUrl} alt={barcode.number} className="barcode-image" />
    } else if (barcode.valid && barcode.svgString) {
      return (
        <div
          className="barcode-svg-preview"
          dangerouslySetInnerHTML={{ __html: barcode.svgString }}
          style={{ maxWidth: Math.min(dimensions.widthPx * 2, 300) + 'px' }}
        />
      )
    } else if (barcode.valid && isGenerating) {
      return <span className="generating-badge">Generating...</span>
    }
    return null
  }

  return (
    <div className="barcode-generator">
      {/* Settings Panel */}
      <div className="settings-panel">
        <h3>Settings</h3>

        <div className="settings-grid">
          {/* Show Numbers Toggle */}
          <div className="setting-item">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showNumbers}
                onChange={(e) => setShowNumbers(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">Show Numbers</span>
            </label>
          </div>

          {/* Export Format Selector */}
          <div className="setting-item">
            <label className="setting-label">Export Format:</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="format-selector"
            >
              <option value="png">PNG</option>
              <option value="svg">SVG</option>
            </select>
          </div>

          {/* Size Inputs */}
          <div className="setting-item size-inputs">
            <label className="setting-label">Size (cm):</label>
            <div className="size-inputs-row">
              <div className="size-input-group">
                <label>Width</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="30"
                  value={widthInput}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  onBlur={() => setWidthInput(widthCm.toFixed(2))}
                />
              </div>
              <div className="size-input-group">
                <label>Height</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="30"
                  value={heightInput}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  onBlur={() => setHeightInput(heightCm.toFixed(4))}
                />
              </div>
              <button
                className={`lock-ratio-btn ${lockRatio ? 'locked' : ''}`}
                onClick={() => setLockRatio(!lockRatio)}
                title={lockRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              >
                {lockRatio ? '🔒' : '🔓'}
              </button>
            </div>
            <div className="size-info">
              Output: {dimensions.widthPx} × {dimensions.heightPx} px
            </div>
          </div>
        </div>
      </div>

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

      {/* Large file warning */}
      {barcodes.length > 500 && !isGenerating && !barcodes.some(b => b.dataUrl || b.svgString) && (
        <div className="warning-banner">
          Large file detected ({barcodes.length} barcodes). Generation may take a minute.
        </div>
      )}

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

          {/* Progress Bar */}
          {showProgress && (
            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="progress-text">
                Generating: {progress.current} / {progress.total} barcodes
                {progress.total > 100 && ` (${Math.round((progress.current / progress.total) * 100)}%)`}
              </p>
            </div>
          )}

          <div className="barcode-items">
            {barcodes.map((barcode, index) => (
              <div key={index} className={`barcode-item ${barcode.valid ? 'valid' : 'invalid'}`}>
                <span className="barcode-number">{barcode.number}</span>
                {barcode.error && <span className="barcode-error">{barcode.error}</span>}
                {renderBarcodePreview(barcode)}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="actions">
            {validCount > 0 && !barcodes.some(b => b.valid && (b.dataUrl || b.svgString)) && (
              <button
                className="btn btn-primary"
                onClick={generateBarcodes}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : `Generate ${validCount} Barcodes`}
              </button>
            )}

            {canDownload && (
              <button
                className="btn btn-success"
                onClick={downloadZip}
                disabled={isGenerating}
              >
                Download ZIP ({validCount} {exportFormat.toUpperCase()} files)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BarcodeGenerator
