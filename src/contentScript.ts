// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_FOR_IMAGE') {
    const images = document.getElementsByTagName('img')
    sendResponse({ hasImage: images.length > 0 })
  }
  
  if (request.type === 'GET_IMAGES') {
    const images = Array.from(document.getElementsByTagName('img'))
    const imageData = images.map(img => ({
      src: img.src,
      width: img.width,
      height: img.height,
      alt: img.alt,
      isBase64: img.src.startsWith('data:image/')
    }))
    sendResponse({ images: imageData })
  }
  
  return true
}) 