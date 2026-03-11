'use client'

import { useState } from 'react'
import Image from 'next/image'

interface ImageCarouselProps {
  images: string[]
  alt: string
}

export function ImageCarousel({ images, alt }: ImageCarouselProps) {
  const [index, setIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div className="w-full h-64 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-400">
        No photos available
      </div>
    )
  }

  return (
    <div className="relative w-full h-64 rounded-lg overflow-hidden bg-zinc-100">
      <Image
        src={images[index]}
        alt={`${alt} ${index + 1}`}
        fill
        className="object-cover"
        unoptimized
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setIndex(i => (i - 1 + images.length) % images.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
          >
            ‹
          </button>
          <button
            onClick={() => setIndex(i => (i + 1) % images.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
          >
            ›
          </button>
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  )
}
