import { useEffect, useRef, useState } from 'react'

// For a wide table whose horizontal scrollbar otherwise only appears at the
// very bottom of the table's own content — this mirrors that scroll position
// into a slim bar fixed to the bottom of the viewport, so it's reachable
// without scrolling all the way down a tall page first. Attach `contentRef`/
// `onContentScroll` to the existing `overflow-x-auto` wrapper around the
// table, then render <StickyScrollbar /> with the rest of the returned props.
export function useStickyScrollbar() {
  const contentRef = useRef(null)
  const trackRef = useRef(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [clientWidth, setClientWidth] = useState(0)

  // No dependency array: re-measure after every render, since the table's
  // content (and therefore its scrollWidth) can change with filters/sorting/
  // data without the content element itself being replaced.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    function measure() {
      setScrollWidth(el.scrollWidth)
      setClientWidth(el.clientWidth)
    }
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  })

  function onContentScroll() {
    if (trackRef.current && contentRef.current) {
      trackRef.current.scrollLeft = contentRef.current.scrollLeft
    }
  }

  function onTrackScroll() {
    if (contentRef.current && trackRef.current) {
      contentRef.current.scrollLeft = trackRef.current.scrollLeft
    }
  }

  return {
    contentRef,
    trackRef,
    onContentScroll,
    onTrackScroll,
    scrollWidth,
    visible: scrollWidth > clientWidth + 1,
  }
}

export function StickyScrollbar({ trackRef, onScroll, scrollWidth, visible }) {
  if (!visible) return null

  return (
    <div
      ref={trackRef}
      onScroll={onScroll}
      className="fixed inset-x-0 bottom-0 z-30 overflow-x-auto overflow-y-hidden border-t border-gray-200 bg-white"
      style={{ height: 14 }}
    >
      <div style={{ width: scrollWidth, height: 1 }} />
    </div>
  )
}
