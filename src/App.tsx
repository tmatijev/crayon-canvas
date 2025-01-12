import { useEffect, useState } from 'react'
import './App.css'

interface ImageData {
  src: string
  width: number
  height: number
  alt: string
}

function App() {
  const [hasImage, setHasImage] = useState<boolean>(false)
  const [images, setImages] = useState<ImageData[]>([])
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [lineIntensity, setLineIntensity] = useState(0.5) // 0 to 1 range

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0]
      if (currentTab?.id) {
        chrome.tabs.sendMessage(currentTab.id, { type: 'CHECK_FOR_IMAGE' }, (response) => {
          setHasImage(!!response?.hasImage)
          if (response?.hasImage) {
            chrome.tabs.sendMessage(currentTab.id, { type: 'GET_IMAGES' }, (response) => {
              if (response?.images) {
                setImages(response.images)
                setSelectedImage(response.images[0])
              }
            })
          }
        })
      }
    })
  }, [])

  const applyPreProcessing = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    // Convert to grayscale and increase contrast
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      
      // Convert to grayscale with color weights
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      
      // Increase contrast to find edges better
      const contrast = 2.0
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
      const value = factor * (gray - 128) + 128
      
      data[i] = data[i + 1] = data[i + 2] = value
    }

    ctx.putImageData(imageData, 0, 0)
  }

  const findEdges = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    const output = ctx.createImageData(width, height)
    const out = output.data

    // Initialize all pixels to white
    for (let i = 0; i < out.length; i += 4) {
      out[i] = out[i + 1] = out[i + 2] = 255
      out[i + 3] = 255
    }

    // Sobel operators for edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]

    // Calculate line color based on intensity
    // Darker at high intensity, lighter at low intensity
    const lineColor = Math.round(200 - (lineIntensity * 120)) // Range from 200 to 80

    // Find edges using Sobel operator with non-maximum suppression
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0
        let gy = 0

        // Apply Sobel operator
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const idx = ((y + i) * width + (x + j)) * 4
            const pixel = data[idx]
            gx += pixel * sobelX[(i + 1) * 3 + (j + 1)]
            gy += pixel * sobelY[(i + 1) * 3 + (j + 1)]
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy)
        const direction = Math.atan2(gy, gx)
        
        // Adjust threshold based on intensity
        const baseThreshold = 100
        const threshold = baseThreshold - (lineIntensity * 50)
        
        // Only draw edge if it's a local maximum in the gradient direction
        if (magnitude > threshold) {
          // Get gradient direction (rounded to nearest 45 degrees)
          const angle = ((Math.round((direction * 180 / Math.PI + 180) / 45) * 45) + 360) % 360
          
          // Check neighbors in gradient direction
          let isMax = true
          const dx = Math.round(Math.cos(angle * Math.PI / 180))
          const dy = Math.round(Math.sin(angle * Math.PI / 180))
          
          // Check if current pixel is maximum compared to neighbors in gradient direction
          const idx1 = ((y + dy) * width + (x + dx)) * 4
          const idx2 = ((y - dy) * width + (x - dx)) * 4
          
          if (y + dy >= 0 && y + dy < height && x + dx >= 0 && x + dx < width) {
            const mag1 = Math.sqrt(
              Math.pow(data[idx1] * sobelX[4], 2) + 
              Math.pow(data[idx1] * sobelY[4], 2)
            )
            if (magnitude < mag1) isMax = false
          }
          
          if (y - dy >= 0 && y - dy < height && x - dx >= 0 && x - dx < width) {
            const mag2 = Math.sqrt(
              Math.pow(data[idx2] * sobelX[4], 2) + 
              Math.pow(data[idx2] * sobelY[4], 2)
            )
            if (magnitude < mag2) isMax = false
          }
          
          if (isMax) {
            const idx = (y * width + x) * 4
            out[idx] = out[idx + 1] = out[idx + 2] = lineColor
          }
        }
      }
    }

    // Connect nearby edges (with smaller neighborhood)
    const tempData = new Uint8ClampedArray(out)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4
        if (tempData[idx] === 255) { // If it's a white pixel
          let blackCount = 0
          let hasGap = false

          // Check in a smaller neighborhood
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (y + dy >= 0 && y + dy < height && x + dx >= 0 && x + dx < width) {
                const nidx = ((y + dy) * width + (x + dx)) * 4
                if (tempData[nidx] !== 255) { // If it's not white
                  blackCount++
                  // Check if there's a gap between pixels
                  const distance = Math.sqrt(dx * dx + dy * dy)
                  if (distance > 1.5) hasGap = true
                }
              }
            }
          }

          // Fill in small gaps between edges
          if (blackCount >= 2 && hasGap) {
            out[idx] = out[idx + 1] = out[idx + 2] = lineColor
          }
        }
      }
    }

    ctx.putImageData(output, 0, 0)
  }

  const smoothLines = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    const width = canvas.width
    const height = canvas.height
    const tempData = new Uint8ClampedArray(data)

    // Calculate line color based on intensity
    const lineColor = Math.round(180 - (lineIntensity * 100)) // Range from 180 to 80

    // Smooth edges while preserving continuity
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4
        if (tempData[idx] !== 255) { // If it's not a white pixel
          let count = 0
          let hasStrongNeighbor = false

          // Check neighborhood
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nidx = ((y + dy) * width + (x + dx)) * 4
              if (tempData[nidx] !== 255) {
                count++
                // Check if this neighbor has other non-white pixels
                for (let dy2 = -1; dy2 <= 1; dy2++) {
                  for (let dx2 = -1; dx2 <= 1; dx2++) {
                    const y2 = y + dy + dy2
                    const x2 = x + dx + dx2
                    if (y2 >= 0 && y2 < height && x2 >= 0 && x2 < width) {
                      const nidx2 = (y2 * width + x2) * 4
                      if (tempData[nidx2] !== 255) hasStrongNeighbor = true
                    }
                  }
                }
              }
            }
          }

          // Keep pixels that are part of continuous lines
          if (count < 2 || !hasStrongNeighbor) {
            data[idx] = data[idx + 1] = data[idx + 2] = 255 // Remove isolated pixels
          } else {
            data[idx] = data[idx + 1] = data[idx + 2] = lineColor // Use intensity-based color
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0)
  }

  const handleConvert = async () => {
    if (!selectedImage) return
    
    setIsProcessing(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = selectedImage.src
      })

      canvas.width = img.width
      canvas.height = img.height
      ctx.drawImage(img, 0, 0)

      // Apply enhanced processing steps
      applyPreProcessing(ctx, canvas)
      findEdges(ctx, canvas)
      smoothLines(ctx, canvas)

      const dataUrl = canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = 'coloring-page.png'
      link.href = dataUrl
      link.click()
    } catch (error) {
      console.error('Error processing image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="app">
      <h1>Crayon Canvas</h1>
      {!hasImage ? (
        <p className="message">Please open this extension on a page with an image.</p>
      ) : (
        <>
          {images.length > 1 && (
            <select 
              className="image-select"
              value={selectedImage?.src}
              onChange={(e) => setSelectedImage(images.find(img => img.src === e.target.value) || null)}
            >
              {images.map((img, index) => (
                <option key={img.src} value={img.src}>
                  Image {index + 1} {img.alt ? `(${img.alt})` : ''}
                </option>
              ))}
            </select>
          )}
          <div className="intensity-control">
            <label htmlFor="intensity">Line Intensity:</label>
            <input
              type="range"
              id="intensity"
              min="0"
              max="1"
              step="0.1"
              value={lineIntensity}
              onChange={(e) => setLineIntensity(Number(e.target.value))}
            />
            <span>{Math.round(lineIntensity * 100)}%</span>
          </div>
          <button 
            className="convert-btn" 
            onClick={handleConvert}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Convert to Coloring Page'}
          </button>
        </>
      )}
    </div>
  )
}

export default App
