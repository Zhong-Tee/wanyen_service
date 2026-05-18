import { useState } from 'react'

interface ZoomImageProps {
  src: string
  alt?: string
  className?: string
  wrapperClassName?: string
}

export function ZoomImage({ src, alt = '', className = '', wrapperClassName = '' }: ZoomImageProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className={`cursor-zoom-in ${wrapperClassName}`} onClick={() => setOpen(true)}>
        <img src={src} alt={alt} className={className} />
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <img src={src} alt={alt} className="max-w-full max-h-full rounded-2xl object-contain" />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-xl hover:bg-white/30"
          >✕</button>
        </div>
      )}
    </>
  )
}
