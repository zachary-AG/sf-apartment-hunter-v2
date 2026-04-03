'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GoogleMap, Marker, InfoWindow, useLoadScript } from '@react-google-maps/api'
import Image from 'next/image'
import type { Listing } from '@/types'
import { GOOGLE_MAPS_LIBRARIES } from '@/lib/maps'

// Stable callback ref hook — avoids adding callbacks to useEffect deps
function useCallbackRef<T extends (...args: never[]) => unknown>(fn: T | undefined) {
  const ref = useRef(fn)
  useLayoutEffect(() => {
    ref.current = fn
  })
  return ref
}

const SF_CENTER = { lat: 37.7749, lng: -122.4194 }
const LIBRARIES = GOOGLE_MAPS_LIBRARIES

function heatmapRadiusForZoom(zoom: number): number {
  if (zoom <= 11) return 15
  if (zoom === 12) return 20
  if (zoom === 13) return 30
  if (zoom === 14) return 45
  return 60 // zoom 15+
}

// SVG pin icons — rendered as data URIs so no external assets needed
function pinIcon(color: string, scale: number): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${28 * scale}" height="${40 * scale}" viewBox="0 0 28 40">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="${color}"/>
      <circle cx="14" cy="14" r="5" fill="white"/>
    </svg>`.trim()
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(28 * scale, 40 * scale),
    anchor: new google.maps.Point(14 * scale, 40 * scale),
  }
}


function coloredWorkPinIcon(color: string): google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="${color}"/>
      <rect x="7" y="14" width="14" height="10" rx="1.5" fill="white"/>
      <rect x="9" y="10" width="10" height="4" rx="1" fill="white" opacity="0.8"/>
      <rect x="10" y="11" width="8" height="3" rx="1" fill="${color}"/>
      <rect x="12" y="17" width="4" height="4" rx="0.5" fill="${color}"/>
    </svg>`.trim()
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(28, 40),
    anchor: new google.maps.Point(14, 40),
  }
}

interface WorkLocation {
  lat: number
  lng: number
  displayName: string
  color: string
}

interface MapProps {
  listings: Listing[]
  showCrime?: boolean
  hoveredListingId?: string | null
  workLocations?: WorkLocation[]
  onCrimeLoadingChange?: (loading: boolean) => void
  onCrimeError?: () => void
}

export function Map({ listings, showCrime = false, hoveredListingId, workLocations = [], onCrimeLoadingChange, onCrimeError }: MapProps) {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  const [popupImgIndex, setPopupImgIndex] = useState(0)
  const mapRef = useRef<google.maps.Map | null>(null)
  const heatmapRef = useRef<google.maps.visualization.HeatmapLayer | null>(null)
  const searchMarkersRef = useRef<google.maps.Marker[]>([])
  const searchInfoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const searchInputInjectedRef = useRef(false)
  const onCrimeLoadingChangeRef = useCallbackRef(onCrimeLoadingChange)
  const onCrimeErrorRef = useCallbackRef(onCrimeError)

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
    libraries: LIBRARIES,
  })

  // Build a custom SVG icon: green dot with the place name as a permanent label below it.
  function searchMarkerIcon(name: string): google.maps.Icon {
    const DOT_R = 8
    const MAX_W = 160
    const CH_W = 7
    const maxChars = Math.floor(MAX_W / CH_W)
    const label = name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name
    const textWidth = label.length * CH_W
    const W = Math.min(Math.max(textWidth + 8, DOT_R * 2 + 4), MAX_W)
    const H = DOT_R * 2 + 18
    const DOT_CX = W / 2

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`,
      `<circle cx="${DOT_CX}" cy="${DOT_R}" r="${DOT_R}" fill="#16a34a" stroke="#fff" stroke-width="2"/>`,
      `<text x="${DOT_CX}" y="${H - 2}" text-anchor="middle"`,
      ` font-family="Arial,sans-serif" font-size="12" fill="#fff"`,
      ` stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`,
      `>${label}</text>`,
      `<text x="${DOT_CX}" y="${H - 2}" text-anchor="middle"`,
      ` font-family="Arial,sans-serif" font-size="12" fill="#1a1a1a"`,
      `>${label}</text>`,
      '</svg>',
    ].join('')

    return {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
      scaledSize: new google.maps.Size(W, H),
      anchor: new google.maps.Point(DOT_CX, DOT_R),
    }
  }

  function clearSearchMarkers() {
    searchMarkersRef.current.forEach(m => m.setMap(null))
    searchMarkersRef.current = []
    searchInfoWindowRef.current?.close()
  }

  async function runPlacesSearch(map: google.maps.Map, query: string) {
    const { Place } = await window.google.maps.importLibrary('places') as google.maps.PlacesLibrary
    const bounds = map.getBounds()

    const { places } = await Place.searchByText({
      textQuery: query,
      fields: ['displayName', 'location', 'formattedAddress'],
      locationRestriction: bounds ?? undefined,
    })

    clearSearchMarkers()

    if (!searchInfoWindowRef.current) {
      searchInfoWindowRef.current = new window.google.maps.InfoWindow()
    }
    const infoWindow = searchInfoWindowRef.current

    for (const place of places) {
      if (!place.location) continue
      const name = place.displayName ?? ''
      const address = place.formattedAddress ?? ''
      const marker = new window.google.maps.Marker({
        map,
        position: place.location,
        icon: searchMarkerIcon(name),
      })

      marker.addListener('click', () => {
        const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' +
          encodeURIComponent(name + ' ' + address)
        infoWindow.setContent(
          '<div style="color:#000;font-family:Arial,sans-serif;font-size:13px;max-width:220px">' +
            '<strong>' + name + '</strong>' +
            (address ? '<br><span style="color:#555;font-size:12px">' + address + '</span>' : '') +
            '<br><a href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color:#1a73e8;font-size:12px">View on Google Maps</a>' +
          '</div>'
        )
        infoWindow.open(map, marker)
      })

      searchMarkersRef.current.push(marker)
    }
  }

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map

    map.addListener('zoom_changed', () => {
      if (heatmapRef.current) {
        const zoom = map.getZoom() ?? 13
        heatmapRef.current.set('radius', heatmapRadiusForZoom(zoom))
      }
    })

    // Inject search input into native map controls (TOP_LEFT) — only once
    if (searchInputInjectedRef.current) return
    searchInputInjectedRef.current = true

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Search nearby (e.g. grocery)'
    input.autocomplete = 'off'
    input.style.cssText = [
      'margin:10px',
      'padding:8px 12px',
      'width:220px',
      'font-size:13px',
      'font-family:Arial,sans-serif',
      'color:#1a1a1a',
      'background:#fff',
      'border:1px solid rgba(0,0,0,0.18)',
      'border-radius:8px',
      'box-shadow:0 2px 6px rgba(0,0,0,0.15)',
      'outline:none',
    ].join(';')

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const q = input.value.trim()
        if (q) runPlacesSearch(map, q).catch(err => console.error('[Map] Places search failed:', err))
      }
    })

    input.addEventListener('input', () => {
      if (input.value.trim() === '') clearSearchMarkers()
    })

    // Prevent map drag/zoom events from firing when interacting with the input
    window.google.maps.event.addDomListener(input, 'keydown', (e: Event) => {
      e.stopPropagation()
    })

    map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(input)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return

    if (showCrime) {
      if (heatmapRef.current) {
        heatmapRef.current.setMap(mapRef.current)
        return
      }
      onCrimeLoadingChangeRef.current?.(true)
      fetch('/api/crime')
        .then(res => {
          if (!res.ok) throw new Error(`Crime API returned ${res.status}`)
          return res.json()
        })
        .then((data: { points?: Array<{ lat: number; lng: number }> }) => {
          if (!data.points?.length || !mapRef.current) throw new Error('No crime data returned')
          const initialZoom = mapRef.current.getZoom() ?? 13
          heatmapRef.current = new google.maps.visualization.HeatmapLayer({
            data: data.points.map(p => new google.maps.LatLng(p.lat, p.lng)),
            map: mapRef.current,
            radius: heatmapRadiusForZoom(initialZoom),
            opacity: 0.7,
            dissipating: true,
            gradient: [
              'rgba(0, 0, 0, 0)',
              'rgba(0, 200, 0, 1)',
              'rgba(150, 230, 0, 1)',
              'rgba(255, 200, 0, 1)',
              'rgba(255, 120, 0, 1)',
              'rgba(255, 0, 0, 1)',
            ],
          })
          onCrimeLoadingChangeRef.current?.(false)
        })
        .catch(err => {
          console.error('[Crime] Failed to fetch crime data:', err)
          onCrimeLoadingChangeRef.current?.(false)
          onCrimeErrorRef.current?.()
        })
    } else {
      if (heatmapRef.current) heatmapRef.current.setMap(null)
    }
  }, [showCrime, isLoaded, onCrimeLoadingChangeRef, onCrimeErrorRef])

  if (loadError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-100 text-zinc-500">
        Failed to load map
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-100 text-zinc-500">
        Loading map...
      </div>
    )
  }

  const popupImages = selectedListing?.images ?? []
  const popupHasMultiple = popupImages.length > 1

  return (
    <div className="flex-1 h-full">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={SF_CENTER}
        zoom={13}
        onLoad={onMapLoad}
        onClick={() => setSelectedListing(null)}
        options={{ mapTypeControl: false, fullscreenControl: false }}
      >
        {listings
          .filter(l => l.lat != null && l.lng != null)
          .map(listing => {
            const isHovered = listing.id === hoveredListingId
            return (
              <Marker
                key={listing.id}
                position={{ lat: listing.lat!, lng: listing.lng! }}
                onClick={() => setSelectedListing(listing)}
                icon={pinIcon(isHovered ? '#2563eb' : '#dc2626', isHovered ? 1.2 : 1)}
                zIndex={isHovered ? 10 : 1}
              />
            )
          })}

        {workLocations.map((wl) => (
          <Marker
            key={`work-${wl.displayName}`}
            position={{ lat: wl.lat, lng: wl.lng }}
            icon={coloredWorkPinIcon(wl.color)}
            zIndex={20}
            title={`${wl.displayName}'s office`}
            clickable={false}
          />
        ))}

        {selectedListing && selectedListing.lat != null && selectedListing.lng != null && (
          <InfoWindow
            key={selectedListing.id}
            position={{ lat: selectedListing.lat, lng: selectedListing.lng }}
            onCloseClick={() => setSelectedListing(null)}
          >
            <div className="text-sm w-48">
              {popupImages.length > 0 && (
                <div
                  className="relative w-full h-28 rounded overflow-hidden bg-zinc-100 mb-2"
                  style={{ userSelect: 'none' }}
                >
                  <Image
                    src={popupImages[popupImgIndex]}
                    alt={selectedListing.address}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  {/* Carousel arrows */}
                  {popupHasMultiple && (
                    <>
                      <button
                        onClick={e => { e.stopPropagation(); setPopupImgIndex(i => (i - 1 + popupImages.length) % popupImages.length) }}
                        className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                        aria-label="Previous image"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setPopupImgIndex(i => (i + 1) % popupImages.length) }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                        aria-label="Next image"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                      <div className="absolute bottom-1 right-1.5 text-white text-[10px] font-medium bg-black/50 rounded px-1 leading-4">
                        {popupImgIndex + 1}/{popupImages.length}
                      </div>
                    </>
                  )}
                </div>
              )}
              <p className="font-medium text-zinc-900 leading-snug">{selectedListing.address}</p>
              <p className="text-zinc-600 mt-0.5">
                {selectedListing.price
                  ? selectedListing.price_max && selectedListing.price_max !== selectedListing.price
                    ? `$${selectedListing.price.toLocaleString()} – $${selectedListing.price_max.toLocaleString()}/mo`
                    : `$${selectedListing.price.toLocaleString()}/mo`
                  : 'Awaiting price'}
              </p>
              {(selectedListing.beds != null || selectedListing.baths != null) && (
                <p className="text-zinc-500">
                  {selectedListing.beds != null && `${selectedListing.beds}bd`}
                  {selectedListing.baths != null && ` ${selectedListing.baths}ba`}
                </p>
              )}
              {selectedListing.added_by_name && (
                <p className="text-zinc-400 text-xs mt-1">Added by {selectedListing.added_by_name}</p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  )
}
