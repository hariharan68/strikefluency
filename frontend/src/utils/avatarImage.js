// Turn a picked image File into a small, square avatar data URI entirely on the
// client: center-crop to a square, downscale to 256×256, encode as JPEG. This
// keeps the stored/transmitted string tiny (~20–40 KB) and matches the server's
// data-URI contract (see schemas/profile.py AvatarUpdate). No dependencies.

const OUTPUT_SIZE = 256
const QUALITY = 0.85
const MAX_INPUT_BYTES = 8 * 1024 * 1024 // reject absurd files before decoding
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']

export function fileToAvatarDataUri(file) {
  return new Promise((resolve, reject) => {
    if (!file || !ACCEPTED.includes(file.type)) {
      reject(new Error('Please choose a PNG, JPEG or WEBP image.'))
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('That image is too large. Pick one under 8 MB.'))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight)
        const sx = (img.naturalWidth - side) / 2
        const sy = (img.naturalHeight - side) / 2

        const canvas = document.createElement('canvas')
        canvas.width = OUTPUT_SIZE
        canvas.height = OUTPUT_SIZE
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

        resolve(canvas.toDataURL('image/jpeg', QUALITY))
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That image couldn't be read. Try a different file."))
    }
    img.src = url
  })
}
