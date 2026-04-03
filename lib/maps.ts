// Shared Google Maps library list — must be a stable module-level reference.
// @react-google-maps/api deduplicates the script load by key; if two useLoadScript
// calls pass different array references (even with identical contents) it warns and
// may behave unpredictably. Importing this constant everywhere guarantees identity equality.
export const GOOGLE_MAPS_LIBRARIES: ('visualization')[] = ['visualization']
